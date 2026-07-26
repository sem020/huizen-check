import { mkdirSync, writeFileSync, accessSync, constants } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Hostinger/PaaS: projectdir is soms read-only → val terug op /tmp.
 */
function resolveDataDir() {
  const preferred = process.env.DATA_DIR || join(root, 'data');
  const candidates = [preferred, join(tmpdir(), 'pandloket-data')];

  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true });
      const probe = join(dir, '.write-test');
      writeFileSync(probe, 'ok');
      accessSync(probe, constants.W_OK);
      return dir;
    } catch (e) {
      console.warn(`Data-dir niet schrijfbaar (${dir}): ${e.message}`);
    }
  }

  throw new Error('Geen schrijfbare data-directory beschikbaar');
}

export const DATA_DIR = resolveDataDir();
export const ROOT_DIR = root;

console.log(`Data directory: ${DATA_DIR}`);
