import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
const ordersFile = join(dataDir, 'orders.json');
const pdfDir = join(dataDir, 'pdfs');

mkdirSync(dataDir, { recursive: true });
mkdirSync(pdfDir, { recursive: true });

if (!existsSync(ordersFile)) writeFileSync(ordersFile, '{}');

function readAll() {
  try {
    return JSON.parse(readFileSync(ordersFile, 'utf8'));
  } catch {
    return {};
  }
}

function writeAll(data) {
  writeFileSync(ordersFile, JSON.stringify(data, null, 2));
}

export function saveOrder(order) {
  const all = readAll();
  all[order.id] = order;
  writeAll(all);
  return order;
}

export function getOrder(id) {
  return readAll()[id] || null;
}

export function updateOrder(id, patch) {
  const all = readAll();
  if (!all[id]) return null;
  all[id] = { ...all[id], ...patch, updatedAt: new Date().toISOString() };
  writeAll(all);
  return all[id];
}

export function pdfPath(orderId) {
  return join(pdfDir, `${orderId}.pdf`);
}

export { pdfDir };
