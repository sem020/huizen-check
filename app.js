/** Hostinger / PaaS entry — log eerst, dan Express starten. */
console.log('[pandloket] starting…', {
  node: process.version,
  cwd: process.cwd(),
  port: process.env.PORT || '3000',
  host: process.env.HOST || '0.0.0.0',
});

try {
  await import('./server/index.js');
} catch (err) {
  console.error('[pandloket] FATAL start error:', err);
  process.exit(1);
}
