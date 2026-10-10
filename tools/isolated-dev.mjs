// Immutable source snapshot for long browser QA while other agents edit the working tree.
import { cp, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

export async function startIsolatedDev(port = 5176) {
  const root = await mkdtemp(join(tmpdir(), 'heatpump-browser-qa-'));
  let server;
  try {
    await Promise.all(['src', 'public', 'index.html', 'package.json'].map(name => cp(resolve(name), join(root, name), { recursive: true })));
    await symlink(resolve('node_modules'), join(root, 'node_modules'), 'dir');
    server = await createServer({ configFile: false, root, base: './', server: { host: '127.0.0.1', port, strictPort: true, hmr: false }, logLevel: 'error' });
    await server.listen();
    return { url: `http://127.0.0.1:${port}/`, sourceRoot: root,
      async close() { await server.close(); await rm(root, { recursive: true, force: true }); } };
  } catch (error) { await server?.close(); await rm(root, { recursive: true, force: true }); throw error; }
}
