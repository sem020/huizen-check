const { readFileSync } = require('fs');
const { join } = require('path');

function loadIndex(root) {
  return readFileSync(join(root, 'index.html'), 'utf8');
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unslug(slug) {
  return decodeURIComponent(String(slug || ''))
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Injecteer SEO-tags in index.html voor /pand/… (crawlers zonder JS).
 */
function renderIndex(root, { title, description, canonical, robots = 'index,follow' }) {
  let html = loadIndex(root);
  const t = esc(title);
  const d = esc(description);
  const c = esc(canonical);

  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${t}</title>`);
  if (/<meta\s+name="description"/i.test(html)) {
    html = html.replace(
      /<meta\s+name="description"[^>]*>/i,
      `<meta name="description" content="${d}">`,
    );
  } else {
    html = html.replace(/<\/title>/i, `</title>\n<meta name="description" content="${d}">`);
  }

  // Strip tags die we opnieuw injecteren
  html = html.replace(/<meta\s+name="robots"[^>]*>\s*/gi, '');
  html = html.replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '');
  html = html.replace(/<meta\s+property="og:[^"]+"[^>]*>\s*/gi, '');
  html = html.replace(/<meta\s+name="twitter:[^"]+"[^>]*>\s*/gi, '');

  const block = `
<meta name="robots" content="${esc(robots)}">
<link rel="canonical" href="${c}">
<meta property="og:type" content="website">
<meta property="og:locale" content="nl_NL">
<meta property="og:site_name" content="Pandloket">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${c}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
`;
  html = html.replace(/<\/head>/i, `${block}</head>`);
  return html;
}

function sitemapXml(publicUrl) {
  const base = publicUrl.replace(/\/$/, '');
  const urls = [
    { loc: `${base}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${base}/over`, priority: '0.8', changefreq: 'monthly' },
    { loc: `${base}/privacy`, priority: '0.3', changefreq: 'yearly' },
    { loc: `${base}/av`, priority: '0.3', changefreq: 'yearly' },
  ];
  const body = urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

function robotsTxt(publicUrl) {
  const base = publicUrl.replace(/\/$/, '');
  return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /bedankt
Disallow: /mock-pay
Disallow: /data/

Sitemap: ${base}/sitemap.xml
`;
}

module.exports = { renderIndex, unslug, sitemapXml, robotsTxt };
