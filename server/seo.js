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
function renderIndex(root, {
  title,
  description,
  canonical,
  robots = 'index,follow',
  placeName = null,
}) {
  let html = loadIndex(root);
  const t = esc(title);
  const d = esc(description);
  const c = esc(canonical);
  const base = canonical.match(/^(https?:\/\/[^/]+)/)?.[1] || 'https://pandloket.nl';
  const image = `${base}/og-image.png`;

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
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/i, '');

  const placeLd = placeName
    ? `,
    {
      "@type": "Place",
      "name": ${JSON.stringify(placeName)},
      "url": ${JSON.stringify(canonical)},
      "description": ${JSON.stringify(description)}
    }`
    : '';

  const ld = `{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "name": ${JSON.stringify(title)},
      "url": ${JSON.stringify(canonical)},
      "description": ${JSON.stringify(description)},
      "isPartOf": { "@type": "WebSite", "name": "Pandloket", "url": "${base}/" }
    },
    {
      "@type": "Organization",
      "name": "Pandloket",
      "url": "${base}/",
      "email": "info@pandloket.nl"
    }${placeLd}
  ]
}`;

  const block = `
<meta name="robots" content="${esc(robots)}">
<link rel="canonical" href="${c}">
<meta property="og:type" content="website">
<meta property="og:locale" content="nl_NL">
<meta property="og:site_name" content="Pandloket">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${c}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${esc(image)}">
<script type="application/ld+json">
${ld}
</script>
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
