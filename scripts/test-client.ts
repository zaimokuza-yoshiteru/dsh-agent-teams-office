import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const repository = resolve(process.env.DSH_DESKTOP_REPO ?? join(root, '../deepseek-harness-desktop'));
const child = spawn(process.execPath, [join(repository, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'test/dsh-client.config.ts'],
  { cwd: root, env: { ...process.env, DSH_DESKTOP_REPO: repository }, stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
