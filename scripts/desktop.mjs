import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const desktop = resolve(process.env.DSH_DESKTOP_REPO ?? join(root, '../deepseek-harness-desktop'));
const loader = join(desktop, 'node_modules/tsx/dist/esm/index.mjs');
if (!existsSync(loader)) throw new Error('Install the desktop repository dependencies first: pnpm install --frozen-lockfile');
const child = spawn(process.execPath, ['--import', loader, join(root, 'scripts/desktop-launch.ts'), ...process.argv.slice(2)],
  { cwd: root, env: { ...process.env, DSH_DESKTOP_REPO: desktop }, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
