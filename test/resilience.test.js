const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const zlib = require('zlib');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pandloket-test-'));
process.env.DATA_DIR = dataDir;
process.env.PANDLOKET_NO_LISTEN = '1';
process.env.PAYMENT_MODE = 'mock';
process.env.OV_REFRESH_DELAY_MS = '600000';
process.env.OV_DATA_EPHEMERAL = '0';

const { app, isPublicAssetPath } = require('../server/index.js');
const ov = require('../server/ov.js');
const supermarkt = require('../server/supermarkt.js');

let upstream;
let upstreamPort;
let appServer;
let appPort;
const hits = { gtfs: 0, overpassFail: 0, overpassOk: 0, hang: 0 };
let goodZip = Buffer.alloc(0);

function request(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: urlPath, method: 'GET' }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* plain text */ }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function makeZip(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pandloket-zip-'));
  const dest = path.join(dir, 'feed.zip');
  const script = path.join(dir, 'pack.py');
  const manifest = [];
  for (const [name, body] of entries) {
    const file = path.join(dir, 'src', name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
    manifest.push(name);
  }
  fs.writeFileSync(script, `
import zipfile, pathlib, sys
root = pathlib.Path(sys.argv[1])
dest = sys.argv[2]
with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as z:
    for name in sys.argv[3:]:
        z.write(root / name, name)
`);
  execFileSync('python3', [script, path.join(dir, 'src'), dest, ...manifest]);
  return fs.readFileSync(dest);
}

before(async () => {
  const stops = [
    'stop_id,stop_name,stop_lat,stop_lon,location_type',
    '1,"Dam",52.373080,4.892580,0',
    '2,"Amsterdam Centraal",52.378000,4.900000,1',
  ].join('\n');
  goodZip = makeZip([
    ['gtfs/stops.txt', stops],
    ['gtfs/agency.txt', 'agency_name\nTest\n'],
  ]);

  upstream = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/gtfs-ok.zip') {
      const range = req.headers.range || '';
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        res.writeHead(200, { 'Content-Length': goodZip.length, 'Accept-Ranges': 'bytes' });
        res.end(goodZip);
        return;
      }
      const start = Number(match[1]);
      const end = match[2] === '' ? goodZip.length - 1 : Math.min(Number(match[2]), goodZip.length - 1);
      const slice = goodZip.subarray(start, end + 1);
      res.writeHead(206, {
        'Content-Type': 'application/zip',
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${goodZip.length}`,
        'Content-Length': slice.length,
      });
      res.end(slice);
      return;
    }
    if (url === '/gtfs-429.zip') {
      hits.gtfs += 1;
      res.writeHead(429, { 'Retry-After': '3600', 'Content-Type': 'text/plain' });
      res.end('rate limit');
      return;
    }
    if (url === '/overpass-fail') {
      hits.overpassFail += 1;
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('bad gateway');
      return;
    }
    if (url === '/overpass-ok') {
      hits.overpassOk += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        elements: [{
          type: 'node',
          id: 1,
          lat: 52.3731,
          lon: 4.8926,
          tags: { shop: 'supermarket', name: 'Testmarkt', brand: 'Test' },
        }],
      }));
      return;
    }
    if (url === '/overpass-hang') {
      hits.hang += 1;
      setTimeout(() => {
        if (res.writableEnded) return;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"elements":[]}');
      }, 1000).unref?.();
      return;
    }
    res.writeHead(404);
    res.end('no');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  upstreamPort = upstream.address().port;

  appServer = await new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
  appPort = appServer.address().port;
});

after(async () => {
  await new Promise(resolve => appServer.close(resolve));
  await new Promise(resolve => upstream.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function api(urlPath) {
  return request(appPort, urlPath);
}

test('stops.txt in een submap van de zip wordt gevonden', () => {
  const text = ov.extractStopsFromZipBuffer(goodZip);
  assert.match(text, /stop_name/);
  assert.match(text, /Dam/);
  const parsed = ov.parseStopsFile(text);
  assert.equal(parsed.length, 2);
});

test('een zip zonder stops.txt faalt duidelijk', () => {
  const zip = makeZip([['agency.txt', 'agency_name\nTest\n']]);
  assert.throws(() => ov.extractStopsFromZipBuffer(zip), /geen stops\.txt/);
});

test('gebundelde halten blijven beschikbaar als OVapi 429 geeft', async () => {
  delete process.env.OV_BUNDLE_PATH;
  delete process.env.OV_BUNDLE_META;
  process.env.OV_GTFS_URLS = `http://127.0.0.1:${upstreamPort}/gtfs-429.zip`;
  process.env.OV_DATA_EPHEMERAL = '0';
  ov.resetOvStateForTests();
  const beforeHits = hits.gtfs;

  const res = await api('/api/ov-dichtbij?lat=52.37308&lon=4.89258&limiet=5&straal=1500');
  assert.equal(res.status, 200);
  assert.equal(res.json.beschikbaar, true);
  assert.ok(res.json.halten.length > 0, 'verwacht halten rond de Dam');

  const refresh = await ov.maybeRefreshStops();
  assert.equal(refresh.skipped, 'fresh');
  assert.equal(hits.gtfs, beforeHits);
});

test('zonder lokale halten geeft een 429 geen HTTP 500 en wordt niet herhaald', async () => {
  process.env.OV_BUNDLE_PATH = '';
  process.env.OV_GTFS_URLS = `http://127.0.0.1:${upstreamPort}/gtfs-429.zip`;
  process.env.OV_DATA_EPHEMERAL = '0';
  ov.resetOvStateForTests();
  const beforeHits = hits.gtfs;

  const refresh = await ov.maybeRefreshStops();
  assert.equal(refresh.ok, false);
  assert.match(refresh.error, /429/);
  assert.equal(hits.gtfs, beforeHits + 1);

  const again = await ov.maybeRefreshStops();
  assert.equal(again.skipped, 'backoff');
  assert.equal(hits.gtfs, beforeHits + 1);

  const res = await api('/api/ov-dichtbij?lat=52.37308&lon=4.89258');
  assert.equal(res.status, 200);
  assert.equal(res.json.beschikbaar, false);
  assert.deepEqual(res.json.halten, []);
  assert.equal(hits.gtfs, beforeHits + 1);
});

test('een werkende GTFS-fallback vult de cache via range-requests, ook met stops.txt in een submap', async () => {
  process.env.OV_BUNDLE_PATH = '';
  process.env.OV_GTFS_URLS = `http://127.0.0.1:${upstreamPort}/gtfs-ok.zip`;
  process.env.OV_DATA_EPHEMERAL = '0';
  ov.resetOvStateForTests();

  const refresh = await ov.maybeRefreshStops();
  assert.equal(refresh.ok, true);
  assert.equal(refresh.count, 2);

  const beforeHits = hits.gtfs;
  process.env.OV_GTFS_URLS = `http://127.0.0.1:${upstreamPort}/gtfs-429.zip`;
  ov.forgetOvMemoryForTests();
  const loaded = await ov.dichtstbijzijndeOv(52.37308, 4.89258, { limiet: 5, straalM: 1500 });
  assert.equal(loaded.beschikbaar, true);
  assert.equal(loaded.halten[0].naam, 'Dam');
  const skipped = await ov.maybeRefreshStops();
  assert.equal(skipped.skipped, 'fresh');
  assert.equal(hits.gtfs, beforeHits);
});

test('een verouderde bundel op tijdelijke schijf triggert geen download', async () => {
  const metaPath = path.join(dataDir, 'oude-meta.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    source: 'gtfs-nl',
    updatedAt: '2020-01-01T00:00:00.000Z',
    license: 'CC0-1.0',
  }));
  process.env.OV_BUNDLE_PATH = path.join(__dirname, '..', 'server', 'data', 'ov-stops.txt.gz');
  process.env.OV_BUNDLE_META = metaPath;
  process.env.OV_GTFS_URLS = `http://127.0.0.1:${upstreamPort}/gtfs-429.zip`;
  process.env.OV_DATA_EPHEMERAL = '1';
  ov.resetOvStateForTests();
  const beforeHits = hits.gtfs;
  const refresh = await ov.maybeRefreshStops();
  assert.equal(refresh.skipped, 'ephemeral');
  assert.equal(hits.gtfs, beforeHits);
  const res = await api('/api/ov-dichtbij?lat=52.37308&lon=4.89258');
  assert.equal(res.status, 200);
  assert.equal(res.json.beschikbaar, true);
  assert.ok(res.json.halten.length > 0);
});

test('ongeldige coördinaten blijven een 400', async () => {
  const res = await api('/api/ov-dichtbij');
  assert.equal(res.status, 400);
  const sm = await api('/api/supermarkt-dichtbij?lat=nee');
  assert.equal(sm.status, 400);
});

test('Overpass 502 wordt opnieuw geprobeerd en eindigt zonder 5xx', async () => {
  process.env.OVERPASS_URLS = `http://127.0.0.1:${upstreamPort}/overpass-fail`;
  supermarkt.resetSupermarktStateForTests();
  const beforeHits = hits.overpassFail;
  const res = await api('/api/supermarkt-dichtbij?lat=52.37308&lon=4.89258');
  assert.equal(res.status, 200);
  assert.equal(res.json.beschikbaar, false);
  assert.equal(res.json.supermarket, null);
  assert.deepEqual(res.json.supermarkets, []);
  assert.ok(hits.overpassFail >= beforeHits + 2, `verwacht een retry, kreeg ${hits.overpassFail - beforeHits}`);
});

test('een volgende Overpass-mirror wordt gebruikt als de eerste faalt', async () => {
  process.env.OVERPASS_URLS = [
    `http://127.0.0.1:${upstreamPort}/overpass-fail`,
    `http://127.0.0.1:${upstreamPort}/overpass-ok`,
  ].join(',');
  supermarkt.resetSupermarktStateForTests();
  const res = await api('/api/supermarkt-dichtbij?lat=52.37308&lon=4.89258');
  assert.equal(res.status, 200);
  assert.equal(res.json.beschikbaar, true);
  assert.equal(res.json.supermarket.naam, 'Testmarkt');
  assert.ok(hits.overpassOk >= 1);
});

test('een hangende Overpass-mirror eindigt zonder 5xx', async () => {
  process.env.OVERPASS_URLS = `http://127.0.0.1:${upstreamPort}/overpass-hang`;
  process.env.OVERPASS_TIMEOUT_MS = '200';
  supermarkt.resetSupermarktStateForTests();
  const started = Date.now();
  const res = await api('/api/supermarkt-dichtbij?lat=52.379&lon=4.899');
  const elapsed = Date.now() - started;
  assert.equal(res.status, 200);
  assert.equal(res.json.beschikbaar, false);
  assert.ok(elapsed < 5000, `duurde ${elapsed}ms`);
  delete process.env.OVERPASS_TIMEOUT_MS;
});

test('statische server levert pagina\'s en verbergt de broncode', async () => {
  assert.equal(isPublicAssetPath('/server/index.js'), false);
  assert.equal(isPublicAssetPath('/css/../package.json'), false);
  assert.equal(isPublicAssetPath('/css/styles.css'), true);
  assert.equal(isPublicAssetPath('/over'), true);

  const hidden = [
    '/server/index.js',
    '/server/ov.js',
    '/server/data/ov-stops.txt.gz',
    '/package.json',
    '/package-lock.json',
    '/.env',
    '/.env.example',
    '/README.md',
  ];
  for (const urlPath of hidden) {
    const res = await api(urlPath);
    assert.equal(res.status, 404, urlPath);
    assert.equal(res.text.includes('"name": "pandloket"'), false, urlPath);
    assert.equal(res.text.includes('dichtstbijzijndeOv'), false, urlPath);
    assert.equal(res.text.includes('express.static'), false, urlPath);
  }

  const traversal = await api('/css/../server/index.js');
  assert.equal(traversal.status, 404);
  assert.equal(traversal.text.includes('dichtstbijzijndeOv'), false);

  const encoded = await api('/js/%2e%2e/package.json');
  assert.equal(encoded.status, 404);

  const pages = {
    '/': 'Pandloket',
    '/over': 'Pandloket',
    '/av': 'Pandloket',
    '/privacy': 'Pandloket',
    '/css/styles.css': '.status',
    '/js/main.js': 'sluitDossier',
    '/robots.txt': 'User-agent',
    '/sitemap.xml': '<urlset',
  };
  for (const [urlPath, needle] of Object.entries(pages)) {
    const res = await api(urlPath);
    assert.equal(res.status, 200, urlPath);
    assert.equal(res.text.includes(needle), true, `${urlPath} mist ${needle}`);
  }
});

test('de gebundelde stops.txt is een bruikbare CC0-subset', () => {
  const gz = fs.readFileSync(path.join(__dirname, '..', 'server', 'data', 'ov-stops.txt.gz'));
  const text = zlib.gunzipSync(gz).toString('utf8');
  const parsed = ov.parseStopsFile(text);
  assert.ok(parsed.length > 10000, `maar ${parsed.length} halten`);
  const meta = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'data', 'ov-stops-meta.json'), 'utf8'));
  assert.equal(meta.license, 'CC0-1.0');
  assert.equal(meta.stops, parsed.length);
});
