import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Check publishable repository sources; Git excludes generated output and local fixtures.
const root = fileURLToPath(new URL('../', import.meta.url));
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' }).split('\0').filter(file => file && existsSync(resolve(root, file)));
const javascript = files.filter(file => /\.[cm]?jsx?$/.test(file));
assert.deepEqual(javascript, [], 'Handwritten JavaScript must be migrated to TypeScript');

const checked = new Set<string>();
const manifest: { scripts: { typecheck: string } } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const configs = [...manifest.scripts.typecheck.matchAll(/tsc -p (tsconfig(?:\.[\w-]+)?\.json)/g)].map(match => match[1]);
assert.ok(configs.length, 'typecheck must run tsc');
for (const config of configs) {
  const parsed = ts.getParsedCommandLineOfConfigFile(resolve(root, config), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: error => {
      throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
    },
  });
  assert.ok(parsed, config);
  assert.deepEqual(parsed.errors, [], config);
  assert.equal(parsed.options.strict, true, `${config} must enable strict checking`);
  assert.ok(!parsed.options.allowJs && !parsed.options.noCheck, `${config} must check TypeScript`);
  for (const file of parsed.fileNames) checked.add(resolve(file));
}
const source = files.filter(file => /\.[cm]?tsx?$/.test(file));
const omitted = source.filter(file => !checked.has(resolve(root, file)));
assert.deepEqual(omitted, [], 'Every TypeScript file must belong to a typecheck configuration');
console.log(`PASS: ${source.length} TypeScript files covered; no handwritten JavaScript.`);
