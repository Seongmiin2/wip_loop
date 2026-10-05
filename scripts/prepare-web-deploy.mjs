import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../web/', import.meta.url));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
if (!existsSync(new URL('../web/index.html', import.meta.url))) {
  throw new Error('Missing web/index.html. Build the exhibition first.');
}
// Only replace this project's generated deployment directory.
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(web, dist, { recursive: true });
console.log('Prepared web/ in dist/ for static hosting.');
