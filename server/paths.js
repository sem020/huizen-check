const { mkdirSync, writeFileSync, accessSync, constants } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const root = join(__dirname, '..');

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

const DATA_DIR = resolveDataDir();
const ROOT_DIR = root;

console.log(`Data directory: ${DATA_DIR}`);

exports.DATA_DIR = DATA_DIR;
exports.ROOT_DIR = ROOT_DIR;
