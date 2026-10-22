// Builds dist/spendlens.zip for upload to the Chrome Web Store.
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipStore } from '../src/lib/xlsx.js';

const include = ['manifest.json', 'icons', 'src'];
const files = [];
const walk = (p) => {
  if (statSync(p).isDirectory()) readdirSync(p).forEach((f) => walk(join(p, f)));
  else files.push({ name: p.split('\\').join('/'), data: new Uint8Array(readFileSync(p)) });
};
include.forEach(walk);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/spendlens.zip', zipStore(files));
console.log(`dist/spendlens.zip (${files.length} files)`);
