/** Publish only the verified archive from a version tag on main. Safe to rerun after a partial release. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const pkg: { name: string; version: string; repository: { url: string } } = JSON.parse(readFileSync('package.json', 'utf8'));
const tag = `v${pkg.version}`;
const channel = pkg.version.includes('-') ? 'beta' : 'latest';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (command: string, args: string[]) => execFileSync(command, args, { stdio: 'inherit' });

function validate() {
  assert.equal(process.env.GITHUB_REF, `refs/tags/${tag}`, 'Select the matching version tag; branches cannot publish');
  assert.equal(process.env.GITHUB_REPOSITORY, 'zaimokuza-yoshiteru/dsh-agent-teams-office');
  assert.equal(pkg.repository.url, `git+https://github.com/${process.env.GITHUB_REPOSITORY}.git`);
  assert.equal(execFileSync('git', ['rev-parse', `${tag}^{commit}`], { encoding: 'utf8' }).trim(),
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), 'The tag must match the checkout');
  run('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main']);
  console.log(`Validated ${pkg.name}@${pkg.version} → ${channel}`);
}

function archive() {
  const packed: { name: string; version: string; filename: string } = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
  assert.equal(packed.name, pkg.name); assert.equal(packed.version, pkg.version);
  assert.equal(packed.filename, `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`);
  const file = resolve('dist', packed.filename), bytes = readFileSync(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(readFileSync('dist/SHA256SUMS', 'utf8'), `${sha256}  ${packed.filename}\n`);
  return { file, integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') };
}

async function publishedIntegrity(): Promise<string | null> {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version)}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 404) return null;
  assert.ok(response.ok, `Registry returned ${response.status}`);
  const metadata: unknown = await response.json();
  assert.ok(metadata && typeof metadata === 'object' && 'dist' in metadata);
  const dist = metadata.dist;
  assert.ok(dist && typeof dist === 'object' && 'integrity' in dist && typeof dist.integrity === 'string');
  return dist.integrity;
}

async function confirmPublication(integrity: string) {
  // npm may accept a publish several minutes before its public registry exposes the version.
  for (let attempt = 0; attempt < 20; attempt++) {
    const published = await publishedIntegrity();
    if (published !== null) {
      assert.equal(published, integrity, 'The published npm archive must match this build');
      return;
    }
    console.log('npm accepted the upload; waiting for the version to become available...');
    await delay(15000);
  }
  throw new Error('npm is still processing this version. Rerun the workflow once it becomes available.');
}

validate();
switch (process.argv[2]) {
  case 'validate': break;
  case 'npm': {
    const {file, integrity} = archive(), existing = await publishedIntegrity();
    if (existing) {
      assert.equal(existing, integrity, 'This version already exists with different contents; use a new version');
      console.log('The identical npm archive is already published.');
    } else run(npm, ['publish', file, '--tag', channel, '--access', 'public', '--provenance', '--ignore-scripts', '--registry=https://registry.npmjs.org']);
    break;
  }
  case 'github': {
    const {file, integrity} = archive();
    await confirmPublication(integrity);
    const release = spawnSync('gh', ['release', 'view', tag, '--json', 'tagName'], { encoding: 'utf8' });
    if (release.status !== 0) {
      const notes = `docs/releases/${pkg.version}.md`;
      run('gh', ['release', 'create', tag, '--verify-tag', '--title', tag,
        ...(channel === 'beta' ? ['--prerelease'] : []),
        ...(existsSync(notes) ? ['--notes-file', notes] : ['--generate-notes'])]);
    }
    run('gh', ['release', 'upload', tag, file, 'dist/SHA256SUMS', '--clobber']);
    break;
  }
  default: throw new Error('Usage: release.ts validate|npm|github');
}
