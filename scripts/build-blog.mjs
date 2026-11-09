// Rail & Road Watch blog: content/blog/<slug>.html (JSON front matter in a leading comment + HTML body)
// -> blog/index.html, blog/<slug>/index.html, data/blog/posts.json (for city-page links) and sitemap entries.
// Usage: node scripts/build-blog.mjs   (run before scripts/build-rail-cities.mjs)
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://railroad-home-check.vercel.app';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cities = JSON.parse(await readFile(resolve(root, 'data/rail-cities/cities.json'), 'utf8')).cities;
const photos = JSON.parse(await readFile(resolve(root, 'data/rail-cities/photos.json'), 'utf8'));
const dateLabel = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

const posts = [];
for (const file of (await readdir(resolve(root, 'content/blog'))).filter(f => f.endsWith('.html')).sort()) {
  const raw = await readFile(resolve(root, 'content/blog', file), 'utf8');
  const m = raw.match(/^<!--([\s\S]*?)-->\s*([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = JSON.parse(m[1]);
  posts.push({ ...meta, slug: file.replace(/\.html$/, ''), body: m[2].trim() });
}
posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

const MARK = '<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M5 18 20 6l15 12M10 16v18h20V16M16 34V23h8v11" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
const HEADER = `<header class="site-header"><a class="brand" href="/">${MARK}<span>Home Surroundings Check</span></a><nav class="gv-nav" aria-label="Main"><a href="/trains/">Cities</a><a href="/blog/">News</a><a href="/guides/">Guides</a></nav></header>`;
const FOOTER = `<footer><p>Rail &amp; Road Watch is written by the Home Surroundings Check editorial team with AI assistance, from public records and linked news reports. Figures come from federal datasets with their own dates; check current conditions locally.</p><nav class="footer-links"><a href="/blog/">All posts</a> <a href="/trains/">Train activity by city</a> <a href="/guides/">Homebuyer guides</a> <a href="/about/">About &amp; corrections</a> <a href="/privacy.html">Privacy Policy</a></nav></footer><a class="gv-sticky" href="/">Check an address</a>`;
const form = (id, label) => `<form class="gv-search" action="/" role="search"><label for="${id}">${label}</label><input id="${id}" name="address" type="text" autocomplete="street-address" placeholder="Enter a U.S. property address" required><button type="submit">Check this address</button></form>`;

function head({ title, description, path, image, ld }) {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script async src="https://www.googletagmanager.com/gtag/js?id=G-ZNQKK7MNDB"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-ZNQKK7MNDB');</script><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3682195653529318" crossorigin="anonymous"></script>
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index, follow"><link rel="canonical" href="${ORIGIN}${path}"><link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
<meta property="og:type" content="article"/><meta property="og:site_name" content="Home Surroundings Check"/><meta property="og:title" content="${esc(title)}"/><meta property="og:description" content="${esc(description)}"/><meta property="og:url" content="${ORIGIN}${path}"/><meta property="og:image" content="${ORIGIN}${image}"/><meta property="og:image:width" content="1200"/><meta property="og:image:height" content="630"/><meta property="og:image:alt" content="${esc(title)}"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="${esc(title)}"/><meta name="twitter:description" content="${esc(description)}"/><meta name="twitter:image" content="${ORIGIN}${image}"/>
${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('')}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/guides.css"><link rel="stylesheet" href="/guide-v2.css"><link rel="stylesheet" href="/blog.css"><script defer src="/guide-ui.js"></script></head>`;
}
const crumbs = list => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: list.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: ORIGIN + path })) });
const cityLabel = s => `${cities[s].name}, ${cities[s].st}`;
const heroPhoto = s => s && photos[s] ? { ...photos[s], alt: `${cities[s].name}` } : { ...photos['dallas-tx'], alt: 'Freight yard in Dallas, TX (illustrative)' };

for (const p of posts) {
  const path = `/blog/${p.slug}/`;
  const image = `/og/blog-${p.slug}.jpg`;
  const ph = heroPhoto(p.city);
  const ld = [
    { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.description, datePublished: p.date, dateModified: p.updated || p.date, image: ORIGIN + image, mainEntityOfPage: ORIGIN + path, author: { '@type': 'Organization', name: 'Home Surroundings Check editorial team', url: ORIGIN + '/about/' }, publisher: { '@type': 'Organization', name: 'Home Surroundings Check', url: ORIGIN + '/' }, about: p.city ? { '@type': 'Place', name: cityLabel(p.city) } : (p.cities || []).filter(c => cities[c]).map(c => ({ '@type': 'Place', name: cityLabel(c) })) },
    crumbs([['Home', '/'], ['Rail & Road Watch', '/blog/'], [p.title, path]])
  ];
  const others = posts.filter(o => o.slug !== p.slug).slice(0, 3);
  const html = `${head({ title: `${p.seoTitle || p.title} | Home Surroundings Check`, description: p.description, path, image, ld })}
<body class="gv gv-post">${HEADER}
<section class="guide-hero"><img class="gv-photo" src="${esc(ph.src)}" alt="" fetchpriority="high" decoding="async"><div class="gv-shade" aria-hidden="true"></div><div class="gv-in">
<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/blog/">Rail &amp; Road Watch</a></nav>
<div class="eyebrow">RAIL &amp; ROAD WATCH · ${esc(dateLabel(p.date).toUpperCase())}</div>
<h1>${esc(p.title)}</h1><p class="lead">${esc(p.lead)}</p>
<p class="post-byline">By the Home Surroundings Check editorial team · Drafted with AI assistance; figures checked against FRA records</p>
<p class="gv-credit">Photo: ${esc(ph.alt)}, ${esc(ph.author || 'Wikimedia Commons')} (<a href="${esc(ph.page)}" rel="noopener">${esc(ph.license || 'source')}</a>)</p></div></section>
<section class="guide-shell"><article class="guide-content post-body">
${p.body}
${p.city ? `<div class="post-city"><div><strong>${esc(cityLabel(p.city))}: every public crossing, mapped</strong><span>Night trains, quiet zones and the busiest crossings from FRA records.</span></div><a href="/trains/${p.city}/">See the city map →</a></div>` : ''}
<div class="guide-cta"><h2>${esc(p.ctaTitle || 'Looking at a home near these tracks?')}</h2><p>${esc(p.ctaText || 'Enter the address to see its nearest crossing, night trains, horn rules, road traffic and flood zone.')}</p>${form('gv-addr-cta', 'Property address')}</div>
<h2>Sources</h2><ul class="post-sources">${p.sources.map(([t, u]) => `<li><a href="${esc(u)}" rel="noopener">${esc(t)}</a></li>`).join('')}</ul>
<p class="post-note">Spotted an error or a change on the ground? <a href="/about/">Tell us</a> and we will correct it.</p>
</article></section>
${others.length ? `<section class="related-guides"><h2>More from Rail &amp; Road Watch</h2><div class="related-grid">${others.map(o => `<a class="related-card" href="/blog/${o.slug}/"><strong>${esc(o.title)}</strong><span>${esc(dateLabel(o.date))}</span></a>`).join('')}</div></section>` : ''}
${FOOTER}</body></html>
`;
  await mkdir(resolve(root, 'blog', p.slug), { recursive: true });
  await writeFile(resolve(root, 'blog', p.slug, 'index.html'), html);
}

// index
{
  const path = '/blog/';
  const title = 'Rail & Road Watch: train horn, quiet zone and road news for homebuyers';
  const description = 'News on railroad quiet zones, train horns, crossings, road projects and flood maps, checked against federal records for homebuyers.';
  const cards = posts.map(p => `<a class="post-card" href="/blog/${p.slug}/"><span class="post-card-meta">${esc(dateLabel(p.date))}${p.city ? ` · ${esc(cityLabel(p.city))}` : p.cities ? ` · ${p.cities.length} cities` : ''}</span><strong>${esc(p.title)}</strong><span class="post-card-lead">${esc(p.description)}</span></a>`).join('');
  const ld = [{ '@context': 'https://schema.org', '@type': 'Blog', name: 'Rail & Road Watch', url: ORIGIN + path, publisher: { '@type': 'Organization', name: 'Home Surroundings Check' }, blogPost: posts.map(p => ({ '@type': 'BlogPosting', headline: p.title, url: `${ORIGIN}/blog/${p.slug}/`, datePublished: p.date })) }, crumbs([['Home', '/'], ['Rail & Road Watch', path]])];
  const html = `${head({ title: `${title} | Home Surroundings Check`, description, path, image: '/og/blog.jpg', ld })}
<body class="gv gv-blog">${HEADER}
<section class="guide-hero"><img class="gv-photo" src="${esc(photos['dallas-tx'].src)}" alt="" fetchpriority="high" decoding="async"><div class="gv-shade" aria-hidden="true"></div><div class="gv-in">
<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a> › Rail &amp; Road Watch</nav>
<div class="eyebrow">RAIL &amp; ROAD WATCH</div><h1>Train horn, quiet zone and road news for homebuyers</h1>
<p class="lead">When a city gains or loses a quiet zone, a crossing closes or a flood map changes, we check it against federal records and explain what it means for homes nearby.</p>
${form('gv-addr', 'Check a U.S. property address')}
<p class="gv-credit">Photo: Freight yard in Dallas, TX, ${esc(photos['dallas-tx'].author)} (<a href="${esc(photos['dallas-tx'].page)}" rel="noopener">${esc(photos['dallas-tx'].license || 'source')}</a>)</p></div></section>
<section class="guide-shell"><div class="post-list">${cards}</div>
<p class="post-note">Posts are written by the Home Surroundings Check editorial team with AI assistance, from linked news reports and public datasets. <a href="/about/">Corrections</a></p></section>
${FOOTER}</body></html>
`;
  await mkdir(resolve(root, 'blog'), { recursive: true });
  await writeFile(resolve(root, 'blog', 'index.html'), html);
}

// posts index for city pages and sitemap
await mkdir(resolve(root, 'data/blog'), { recursive: true });
await writeFile(resolve(root, 'data/blog/posts.json'), JSON.stringify(posts.map(({ body, ...m }) => m), null, 1));
const smPath = resolve(root, 'sitemap.xml');
let sm = await readFile(smPath, 'utf8');
sm = sm.replace(/\s*<url><loc>https:\/\/railroad-home-check\.vercel\.app\/blog\/[^<]*<\/loc>[\s\S]*?<\/url>/g, '');
const latest = posts[0]?.updated || posts[0]?.date;
const entries = [`  <url><loc>${ORIGIN}/blog/</loc><lastmod>${latest}</lastmod></url>`, ...posts.map(p => `  <url><loc>${ORIGIN}/blog/${p.slug}/</loc><lastmod>${p.updated || p.date}</lastmod></url>`)].join('\n');
sm = sm.replace('</urlset>', `${entries}\n</urlset>`);
await writeFile(smPath, sm);
console.log(`Built blog: ${posts.length} posts`);
