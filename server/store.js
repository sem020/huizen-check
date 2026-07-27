const { mkdirSync, readFileSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');
const { DATA_DIR } = require('./paths.js');
const ordersFile = join(DATA_DIR, 'orders.json');
const pdfDir = join(DATA_DIR, 'pdfs');

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

function saveOrder(order) {
  const all = readAll();
  all[order.id] = order;
  writeAll(all);
  return order;
}

function getOrder(id) {
  return readAll()[id] || null;
}

function updateOrder(id, patch) {
  const all = readAll();
  if (!all[id]) return null;
  all[id] = { ...all[id], ...patch, updatedAt: new Date().toISOString() };
  writeAll(all);
  return all[id];
}

function pdfPath(orderId) {
  return join(pdfDir, `${orderId}.pdf`);
}

exports.pdfDir = pdfDir;

exports.saveOrder = saveOrder;
exports.getOrder = getOrder;
exports.updateOrder = updateOrder;
exports.pdfPath = pdfPath;
