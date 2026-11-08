// Builds static city train-activity pages from FRA crossing aggregates.
// Input:  data/rail-cities/{cities,summary,mainline,maps}.json
// Output: trains/index.html, trains/<slug>/index.html, trains/<slug>/map.svg, sitemap.xml entries
// Run:    node scripts/build-rail-cities.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://railroad-home-check.vercel.app';
const readJson = async p => JSON.parse(await readFile(resolve(root, p), 'utf8'));

const meta = await readJson('data/rail-cities/cities.json');
const summary = await readJson('data/rail-cities/summary.json');
const mainline = await readJson('data/rail-cities/mainline.json');
const maps = await readJson('data/rail-cities/maps.json');

const FETCHED = meta.fetchedOn;
const FETCHED_LABEL = new Date(`${FETCHED}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const INC_FROM = 'January 2021';
const INC_TO = 'August 2026';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const fmt = n => Number(n).toLocaleString('en-US');
const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const crossingUrl = id => `https://safetydata.fra.dot.gov/OfficeofSafety/PublicSite/Crossing/Crossing.aspx?phasetype=C&rpttype=I&txtcrossingnum=${encodeURIComponent(id)}`;

const SMALL_WORDS = new Set(['of', 'and', 'the', 'at', 'in', 'on']);
const KEEP_UPPER = /^(CSX|BNSF|UP|NS|KCS|CPKC|RTD|UTA|DART|SEPTA|CTA|METRA|TEX|II|III|IV|SR|FM|IH|US|SH|NE|NW|SE|SW|N|S|E|W|LLC|L\.L\.C\.|RJ|R\.|J\.|CN)$/;
function titleCase(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.split(' ').map((w, i) => {
    if (KEEP_UPPER.test(w.toUpperCase()) && (w === w.toUpperCase())) return w.toUpperCase();
    const lower = w.toLowerCase();
    if (i > 0 && SMALL_WORDS.has(lower)) return lower;
    return lower.replace(/(^|[-/(])([a-z])/g, (m, p, c) => p + c.toUpperCase()).replace(/^(\d+)(St|Nd|Rd|Th)$/i, (m, d, suf) => d + suf.toLowerCase());
  }).join(' ').replace(/\b(\d+) (Nd|Rd|Th|St)\b(?= )/g, (m, d, suf) => d + suf.toLowerCase());
}
const RR_NAMES = {
  'NORTHEAST ILLINOIS REGIONAL COMMUTER RAIL CORP. -- METRA': 'Metra',
  'Belt': 'Belt Railway of Chicago',
  'Consolidated Rail Corporation': 'Conrail Shared Assets',
  'GRAND TRUNK WESTERN RAILROAD INC.': 'Grand Trunk Western (CN)',
  'Canadian National - North America': 'Canadian National',
  'Illinois Central': 'Illinois Central (CN)',
  "Manufacturers'": "Manufacturers' Railway",
  'R. J. CORMAN': 'R.J. Corman',
  'PORTLAND TERMINAL -- OREGON': 'Portland Terminal Railroad',
  'PTRC': 'Portland Terminal Railroad (PTRC)',
  'Amtrak (National Railroad Passenger Corporation)': 'Amtrak',
  'Southeastern Pennsylvania Transportation Authority': 'SEPTA',
  'Southern California Regional Rail Authority': 'Metrolink (SCRRA)',
  'Los Angeles County Metropolitan Trans Authority': 'LA Metro',
  'Metropolitan Transit Authority of Harris County Texas': 'Houston METRO',
  'Capital Metropolitan Transportation Authority': 'CapMetro',
  'Dallas Area Rapid Transit': 'DART',
  'TRINITY RAILWAY EXPRESS': 'Trinity Railway Express',
  'Tex Rail': 'TEXRail',
  'REGIONAL TRANSPORTATION DISTRICT -- DENVER': 'RTD Denver (light rail)',
  'Regional Transit District- Commuter': 'RTD Denver (commuter rail)',
  'RTD Denver Union Station': 'RTD Denver Union Station',
  'UTA FrontRunner Commuter Rail': 'UTA FrontRunner',
  'Utah': 'Utah Railway',
  'North County Transportation District- Coaster': 'NCTD Coaster',
  'North County Transportation Distrcit- Sprinter': 'NCTD Sprinter',
  'Metropolitan Transit Development Board': 'San Diego MTS',
  'San Diego Trolley Incorporated': 'San Diego Trolley',
  'TRIMET (MAX LIGHT RAIL)': 'TriMet MAX',
  'TriMet Portland-Milwaukie-Orange Line': 'TriMet MAX Orange Line',
  'Chicago Transit Authority': 'Chicago Transit Authority',
  'MISSOURI EASTERN RAILROAD, LLC': 'Missouri Eastern Railroad',
  'THE PRAIRIE LINE': 'The Prairie Line',
  'KANSAS CITY WEST BOTTOM RAILROAD': 'Kansas City West Bottom Railroad',
  'FLORIDA MIDLAND': 'Florida Midland Railroad',
  'INDIANA SOUTHERN': 'Indiana Southern Railroad',
  'Indiana Rail Road Company': 'Indiana Rail Road',
  'Jacksonville Port Terminal Railroad L.L.C.': 'Jacksonville Port Terminal Railroad',
  'PACIFIC HARBOR LINE, INC.': 'Pacific Harbor Line',
  'Department Of Defense - Other': 'U.S. Department of Defense',
  'Kansas City Terminal': 'Kansas City Terminal Railway',
  'Stillwater Central': 'Stillwater Central Railroad',
  'Oregon Pacific': 'Oregon Pacific Railroad',
  'Florida East Coast': 'Florida East Coast Railway',
  'Louisville & Indiana': 'Louisville & Indiana Railroad',
  'New Orleans & Gulf Coast': 'New Orleans & Gulf Coast Railway',
  'Union Pacific': 'Union Pacific',
  'Norfolk Southern': 'Norfolk Southern',
  'Kansas City Southern': 'Kansas City Southern (CPKC)',
  'SOO KCS Joint Agency': 'Soo Line / KCS joint agency',
  'Terminal Railroad Association Of St. Louis': 'Terminal Railroad Association of St. Louis'
};
const rrName = raw => RR_NAMES[raw] ?? titleCase(raw);
const TRANSIT_RE = /transit|trolley|metro|rapid|light rail|trimet|regional transportation district|\bRTD\b|tex ?rail|capital metropolitan|utah transit|frontrunner|commuter|metra|southeastern pennsylvania|southern california regional|coaster|sprinter|trinity railway|amtrak|passenger|mts|septa|dart/i;

const qzLabel = code => ({ '1': '24-hour quiet zone', '2': 'Partial quiet zone', '3': 'Chicago-excused', '0': 'Not a quiet zone' })[String(code)] ?? 'Quiet zone not reported';
const street = s => (s && s.trim() ? titleCase(s) : 'Unnamed crossing');

const slugs = Object.keys(meta.cities);
for (const s of slugs) if (!summary[s] || !mainline[s] || !maps[s]) throw new Error(`Missing data for ${s}`);
const label = s => `${meta.cities[s].name}, ${meta.cities[s].st}`;

// ---------- Map SVG ----------
const COLORS = { 0: '#A3ADBF', 1: '#2451E6', 2: '#E8590C', 3: '#0F7B6C' };
function mapGeometry(slug) {
  const m = maps[slug];
  const [la0, la1, lo0, lo1] = m.b;
  const k = Math.cos(((la0 + la1) / 2) * Math.PI / 180);
  const W = 760;
  const H = Math.round(W / (((lo1 - lo0) * k) / (la1 - la0)));
  return { m, la0, la1, lo0, lo1, k, W, H };
}
function mapSvg(slug) {
  const { m, la0, la1, lo0, lo1, k, W, H } = mapGeometry(slug);
  const P = 20, TW = W + 2 * P, TH = H + 2 * P;
  const bytes = Buffer.from(m.p, 'base64');
  const pts = [];
  for (let i = 0; i + 2 < bytes.length; i += 3) pts.push([P + (bytes[i] / 255) * W, P + (bytes[i + 1] / 255) * H, bytes[i + 2]]);
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TW} ${TH}" width="${TW}" height="${TH}" role="img" aria-label="Map of public rail crossings in ${esc(label(slug))}">`,
    `<rect width="${TW}" height="${TH}" rx="18" fill="#EEF2F8"/>`];
  for (let i = 1; i < 8; i++) out.push(`<line x1="${(P + (i * W) / 8).toFixed(0)}" y1="${P}" x2="${(P + (i * W) / 8).toFixed(0)}" y2="${H + P}" stroke="#DFE5EF"/>`);
  const rows = Math.max(4, Math.round((8 * H) / W));
  for (let i = 1; i < rows; i++) out.push(`<line x1="${P}" y1="${(P + (i * H) / rows).toFixed(0)}" x2="${W + P}" y2="${(P + (i * H) / rows).toFixed(0)}" stroke="#DFE5EF"/>`);
  const dx = P + ((m.dt[1] - lo0) / (lo1 - lo0)) * W, dy = P + ((la1 - m.dt[0]) / (la1 - la0)) * H;
  out.push(`<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="30" fill="none" stroke="#0F1B33" stroke-width="1.5" stroke-dasharray="4 4" opacity=".55"/>`);
  for (const cat of [0, 1, 2, 3]) {
    const r = cat === 0 ? 4.2 : 5;
    for (const [x, y, c] of pts) if (c === cat) out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${COLORS[c]}" stroke="#FFF" stroke-width="1.2"/>`);
  }
  const lx = Math.min(dx + 34, TW - 110), ly = Math.max(dy - 44, 8);
  out.push(`<g font-family="Helvetica, Arial, sans-serif" font-weight="700"><rect x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" width="92" height="26" rx="13" fill="#0F1B33"/><text x="${(lx + 46).toFixed(1)}" y="${(ly + 18).toFixed(1)}" font-size="13" fill="#FFF" text-anchor="middle">Downtown</text></g>`);
  const pxPerMile = W / ((lo1 - lo0) * 69.17 * k);
  const miles = [1, 2, 5, 10, 20].find(mi => mi * pxPerMile >= 60) ?? 20;
  const bw = Math.round(miles * pxPerMile), sx = P + 22, sy = TH - 34;
  out.push(`<g font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#44506A" stroke="#44506A" stroke-width="2"><line x1="${sx}" y1="${sy}" x2="${sx + bw}" y2="${sy}"/><line x1="${sx}" y1="${sy - 5}" x2="${sx}" y2="${sy + 5}"/><line x1="${sx + bw}" y1="${sy - 5}" x2="${sx + bw}" y2="${sy + 5}"/><text x="${sx}" y="${sy + 20}" stroke="none">${miles} ${miles === 1 ? 'mile' : 'miles'}</text></g>`);
  const nx = TW - 46, ny = P + 36;
  out.push(`<g fill="#44506A" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="700"><path d="M${nx} ${ny - 22}L${nx + 8} ${ny}L${nx} ${ny - 6}L${nx - 8} ${ny}Z"/><text x="${nx}" y="${ny + 16}" text-anchor="middle">N</text></g>`);
  out.push('</svg>');
  return { svg: out.join('\n'), width: TW, height: TH };
}

// ---------- Shared chrome ----------
const ICON = {
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  mute: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
  gauge: '<path d="M12 13a8 8 0 0 1 8 8"/><path d="M4 21a8 8 0 0 1 8-8"/><path d="m12 13 4-6"/><circle cx="12" cy="13" r="1.5"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12Z"/>',
  alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>'
};
const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

function head({ title, description, path, jsonLd, ogImage }) {
  const url = `${ORIGIN}${path}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-ZNQKK7MNDB"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-ZNQKK7MNDB');
</script>
<!-- Google AdSense -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3682195653529318" crossorigin="anonymous"></script>
<meta name="description" content="${esc(description)}"/>
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"/>
<link rel="canonical" href="${url}"/>
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/rail-cities.css"/>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
<meta property="og:type" content="article"/><meta property="og:site_name" content="Home Surroundings Check"/><meta property="og:title" content="${esc(title)}"/><meta property="og:description" content="${esc(description)}"/><meta property="og:url" content="${url}"/>${ogImage ? `<meta property="og:image" content="${ORIGIN}${ogImage}"/>` : ''}
${jsonLd.map(j => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
</head><body class="rc">
<header class="rc-top"><div class="rc-wrap rc-top-in"><a class="rc-brand" href="/"><span class="rc-logo"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/></svg></span>Home Surroundings Check</a><nav class="rc-nav" aria-label="Main"><a href="/trains/">Cities</a><a href="/guides/">Guides</a><a href="/home-surroundings-data/">Data &amp; limits</a></nav></div></header>`;
}
const FOOTER = `<footer class="rc-foot"><div class="rc-wrap"><p>Data: U.S. DOT / Federal Railroad Administration crossing inventory (Form 71) and accident reports (Form 57). Counts are railroad-reported estimates, not schedules or noise measurements. Independent informational site.</p><nav aria-label="Footer"><a href="/trains/">Train activity by city</a><a href="/guides/">All homebuyer guides</a><a href="/about/">About &amp; corrections</a><a href="/privacy.html">Privacy Policy</a></nav></div></footer>
<script>
(function(){
  var path = location.pathname;
  function track(){ if (typeof window.gtag === 'function') window.gtag('event', 'guide_checker_click', { guide_path: path, transport_type: 'beacon' }); }
  document.querySelectorAll('form.rc-search').forEach(function(f){
    f.addEventListener('submit', function(e){
      e.preventDefault();
      var v = (f.querySelector('input').value || '').trim().slice(0, 250);
      track();
      location.href = v ? '/#' + new URLSearchParams({ address: v }).toString() : '/';
    });
  });
  document.querySelectorAll('a.rc-cta-link').forEach(function(a){ a.addEventListener('click', track); });
})();
</script>
</body></html>`;

function searchBox(id, cityName) {
  return `<form class="rc-search" action="/" method="get"><label for="${id}">Check one property address</label><div class="rc-search-row"><input id="${id}" name="q" type="text" autocomplete="street-address" placeholder="e.g. a ${esc(cityName)} street address" maxlength="250"/><button type="submit">Check this home</button></div><p class="rc-search-note">Opens the checker with this address filled in. Nearest crossing, day &amp; night trains, quiet zone, speed and incident history.</p></form>`;
}

function breadcrumbLd(items) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${ORIGIN}${path}` })) };
}
function articleLd(headline, path, description, image) {
  return { '@context': 'https://schema.org', '@type': 'Article', headline, description, datePublished: FETCHED, dateModified: FETCHED, mainEntityOfPage: `${ORIGIN}${path}`, ...(image ? { image: `${ORIGIN}${image}` } : {}), author: { '@type': 'Organization', name: 'Home Surroundings Check', url: `${ORIGIN}/about/` }, publisher: { '@type': 'Organization', name: 'Home Surroundings Check' }, isBasedOn: 'https://data.transportation.gov/resource/m2f8-22s6' };
}

function barRows(rows, max, { operator = false } = {}) {
  return rows.map(r => {
    const dW = max ? ((r.d / max) * 100).toFixed(1) : 0, nW = max ? ((r.n / max) * 100).toFixed(1) : 0;
    const sub = [rrName(r.rr), `FRA <a href="${crossingUrl(r.id)}" rel="nofollow">${esc(r.id)}</a>`, r.sp ? `${r.sp} mph` : null, qzLabel(r.qz), r.y && r.y > 1900 ? `counted ${r.y}` : 'count year not reported'].filter(Boolean);
    return `<div class="rc-bar-row"><div class="rc-bar-name"><strong>${esc(street(r.st))}</strong><span>${sub.map((s, i) => (i === 1 ? s : esc(s))).join(' · ')}</span></div><div class="rc-bar-viz"><div class="rc-bar" role="img" aria-label="${r.d} day and ${r.n} night trains per day"><span class="rc-day" style="width:${dW}%"></span><span class="rc-night" style="width:${nW}%"></span></div><div class="rc-bar-num"><strong>${r.d}</strong> day · <strong>${r.n}</strong> night</div></div></div>`;
  }).join('');
}

function cityPage(slug) {
  const c = summary[slug];
  const m = mainline[slug];
  const mp = maps[slug];
  const name = meta.cities[slug].name;
  const L = label(slug);
  const path = `/trains/${slug}/`;
  const qz = c.qz24 + c.qzP + c.qzC;
  const nonMain = c.n - m.fN;
  const transitHeavy = nonMain / c.n >= 0.15;
  const thin = m.fWith < 15 || m.fMax < 5;
  const nightOfActive = pct(c.night, c.withTrains);
  const fTop = m.fTop.map(([id, st, rr, d, n, sp, qzc, y]) => ({ id, st, rr, d, n, sp, qz: qzc, y }));
  const allTop = c.top.map(([id, st, rr, d, n, p, sp, qzc, y]) => ({ id, st, rr, d, n, sp, qz: qzc, y }));
  const railroads = c.rr.map(([r, k]) => ({ name: rrName(r), raw: r, k }));
  const transitRR = railroads.filter(r => TRANSIT_RE.test(r.raw));
  const oldCounts = c.withTrains - c.yRecent;
  const recentShare = c.withTrains ? c.yRecent / c.withTrains : 0;
  const { width: mapW, height: mapH } = mapSvg(slug);

  const title = `Trains in ${L}: Crossings, Night Trains & Quiet Zones`;
  const h1 = `Trains near a ${name} home: what the records show`;
  const description = `FRA data for ${L}: ${fmt(c.n)} public rail crossings, ${fmt(c.night)} reporting night trains, ${fmt(qz)} in quiet zones. See the crossing map and what to check before buying.`;

  const lead = `The FRA inventory lists <strong>${plural(c.n, 'public at-grade crossing')}</strong> in or near ${esc(name)}. <strong>${fmt(c.night)}</strong> report trains between 6 PM and 6 AM, and <strong>${fmt(qz)}</strong> sit in a quiet zone. ${thin ? `Most activity here is light rail and commuter service; the busiest crossing reports <strong>${fmt(c.max)}</strong> trains a day.` : `On railroad-company lines, a typical active crossing reports about <strong>${plural(m.fMed, 'train')} a day</strong>; the busiest reports <strong>${fmt(m.fMax)}</strong>.`}`;

  const nightBadge = nightOfActive >= 85 ? ['VERY COMMON', 'warn'] : nightOfActive >= 50 ? ['COMMON', 'warn'] : ['LIMITED', 'ok'];
  const qzBadge = qz === 0 ? ['NONE', 'warn'] : pct(qz, c.n) >= 40 ? ['WIDE', 'ok'] : ['PATCHY', 'warn'];
  const freshBadge = recentShare >= 0.6 ? ['RECENT', 'ok'] : recentShare >= 0.4 ? ['MIXED', 'neutral'] : ['OFTEN OLD', 'warn'];
  const glance = [
    ['moon', 'warn', 'Night trains', `${fmt(c.night)} crossings · ${nightOfActive}% of active`, nightBadge],
    ['mute', 'ok', 'Quiet zones', `${fmt(qz)} crossings · ${pct(qz, c.n)}%`, qzBadge],
    ['gauge', 'blue', 'Top timetable speed', `${fmt(c.maxSpeed)} mph`, null],
    ['cal', 'neutral', 'Count freshness', `${fmt(c.yRecent)} of ${fmt(c.withTrains)} counted 2021+`, freshBadge]
  ].map(([ic, tone, k, v, b]) => `<li><span class="rc-ico rc-${tone}">${icon(ic)}</span><div><span class="rc-k">${k}</span><span class="rc-v">${v}</span></div>${b ? `<span class="rc-badge rc-${b[1]}">${b[0]}</span>` : ''}</li>`).join('');

  const [cz, cd, cn, cq] = mp.c;
  const insights = [];
  insights.push(cn >= cz + cd ? `<p><strong>Orange dominates.</strong> Most crossings with any traffic report night trains and sit outside a quiet zone.</p>` : `<p><strong>Night trains concentrate on fewer lines.</strong> ${plural(cn, 'crossing')} report night trains outside a quiet zone; find out whether the line near your home is one of them.</p>`);
  insights.push(cq === 0 ? `<p><strong>No green dots.</strong> No public crossing here is reported in a quiet zone, so routine horn sounding is the default.</p>` : pct(cq, c.n) >= 40 ? `<p><strong>Green covers much of the map.</strong> ${plural(cq, 'crossing')} restrict routine horns, but emergency horns and bells still apply.</p>` : `<p><strong>Quiet zones are scattered.</strong> Only ${plural(cq, 'crossing')} (${pct(cq, c.n)}%) restrict routine horns — check the one nearest the home.</p>`);
  insights.push(`<p><strong>Gray is not silence.</strong> It means no daily count was reported, not zero trains.</p>`);

  const paras = [];
  if (c.qzC > 0) paras.push(`<p><strong>Chicago has its own horn rules.</strong> ${plural(c.qzC, 'crossing')} are reported as Chicago-excused, ${fmt(c.qz24)} as 24-hour quiet zones and ${fmt(c.qzP)} as ${c.qzP === 1 ? 'a partial quiet zone' : 'partial quiet zones'}. Quiet-zone status limits routine horn sounding but does not silence emergency horns, bells or wayside equipment. <a href="/quiet-zone-homebuyer-guide/">Read the quiet-zone guide</a>.</p>`);
  else if (qz === 0) paras.push(`<p><strong>Horns are the default.</strong> None of the ${fmt(c.n)} public crossings is reported in an FRA quiet zone, so routine horn sounding at public crossings applies under the federal Train Horn Rule. Distance to the nearest crossing matters more here than in cities with broad quiet-zone coverage. <a href="/train-horns-near-house/">Train horns near a house</a>.</p>`);
  else paras.push(`<p><strong>Confirm the crossing, not the neighborhood.</strong> Quiet-zone status is reported crossing by crossing (${fmt(qz)} of ${fmt(c.n)} here). Engineers can still sound horns for emergencies, and a home can sit between a quiet-zone crossing and one that is not. <a href="/quiet-zone-homebuyer-guide/">How quiet zones work</a>.</p>`);
  if (transitHeavy) paras.push(`<p><strong>The highest counts come from passenger rail.</strong> ${fmt(nonMain)} of the ${fmt(c.n)} crossings are on transit or commuter lines${transitRR.length ? ` such as ${esc(transitRR.slice(0, 3).map(r => r.name).join(', '))}` : ''}, with counts up to ${fmt(c.max)} trains a day. ${thin ? 'Railroad-company lines report little traffic here, so the busiest-crossing list includes every operator.' : 'Railroad-company lines are listed separately below.'}</p>`);
  if (c.withTrains > 0 && oldCounts / c.withTrains >= 0.4) paras.push(`<p><strong>Many counts are old.</strong> ${fmt(oldCounts)} of ${fmt(c.withTrains)} active crossings carry a count year before 2021 or none at all (range ${c.yMin}–${c.yMax}). Ask the seller or neighbors whether traffic has changed.</p>`);
  paras.push(`<p><strong>Crossing incidents.</strong> FRA accident reports list ${plural(c.incTotal, 'highway-rail incident')} at ${fmt(c.incX)} of these crossings between ${INC_FROM} and ${INC_TO}. That is a safety record for vehicles and pedestrians, not a noise measure. <a href="/railroad-crossing-accident-history/">How to read crossing accident history</a>.</p>`);

  const listRows = thin ? allTop.slice(0, 6) : fTop;
  const listMax = Math.max(...listRows.map(r => r.d + r.n), 1);
  const busiest = `<section class="rc-wrap rc-sec"><div class="rc-card"><div class="rc-card-head"><h2>${thin ? `Busiest rail crossings in ${esc(name)}` : `Busiest railroad crossings in ${esc(name)}`}</h2><div class="rc-key"><span><i class="rc-day"></i>Day</span><span><i class="rc-night"></i>Night</span></div></div>${barRows(listRows, listMax)}<p class="rc-note">Reported through trains per day (day 6 AM–6 PM, night 6 PM–6 AM). ${thin ? 'Includes light rail and commuter operators.' : 'Excludes transit-agency crossings; commuter or passenger trains may still share these tracks.'} One train passes several crossings — don't add rows together.</p></div></section>`;
  const transitList = !thin && transitHeavy ? (() => { const rows = allTop.slice(0, 5); const mx = Math.max(...rows.map(r => r.d + r.n), 1); return `<section class="rc-wrap rc-sec"><div class="rc-card"><div class="rc-card-head"><h2>Including light rail and commuter lines</h2></div>${barRows(rows, mx)}<p class="rc-note">Light rail and commuter trains are usually shorter than freight, but crossing bells and horns still apply. Some records omit a count year or use placeholder values.</p></div></section>`; })() : '';

  const sameState = slugs.filter(s => s !== slug && meta.cities[s].st === meta.cities[slug].st);
  const idx = slugs.indexOf(slug);
  const others = [...sameState, ...[1, 2, 3, 4, 5, 6].map(k => slugs[(idx + k) % slugs.length])].filter((s, i, a) => s !== slug && a.indexOf(s) === i).slice(0, 6);
  const related = others.map(s => { const g = mapGeometry(s); return `<a class="rc-city" href="/trains/${s}/"><img src="/trains/${s}/map.svg" alt="" width="${g.W + 40}" height="${g.H + 40}" loading="lazy"/><strong>${esc(label(s))}</strong><span>${plural(summary[s].n, 'crossing')} · ${fmt(summary[s].night)} with night trains</span></a>`; }).join('');

  const faq = [
    [`Do trains run at night in ${name}?`, `${fmt(c.night)} of ${fmt(c.withTrains)} crossings with reported traffic list trains between 6 PM and 6 AM. Check the specific crossing near a home, because night traffic varies by line.`],
    [`Are there railroad quiet zones in ${name}?`, qz ? `${fmt(qz)} public crossings are reported in an FRA quiet zone${c.qzC ? ` (including ${fmt(c.qzC)} Chicago-excused crossings)` : ''}. Status is reported per crossing, so confirm the crossing nearest the address.` : `None of the ${fmt(c.n)} public crossings in this set is reported in an FRA quiet zone, so routine horn sounding is the default at public crossings.`],
    [`Which railroads operate in ${name}?`, `By number of public crossings: ${railroads.slice(0, 4).map(r => `${r.name} (${r.k})`).join(', ')}.`],
    [`How fast do trains go through ${name}?`, `The highest maximum timetable speed reported at these crossings is ${c.maxSpeed} mph. Many urban crossings report much lower limits; the busiest-crossing list shows the speed for each.`]
  ].map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');

  const steps = [
    ['pin', 'Find the nearest crossing', 'Horns sound at crossings, so distance to the crossing matters more than distance to the track.'],
    ['moon', 'Read its night count', 'Note night trains, quiet-zone status and count year for that crossing ID.'],
    ['clock', 'Visit after 10 PM', 'Listen outside, then inside with windows closed. Feel for vibration.'],
    ['chat', 'Ask the neighbors', 'Has traffic changed since the count year? Counts are estimates, not schedules.']
  ].map(([ic, h, p]) => `<div class="rc-step"><span class="rc-step-ico">${icon(ic, 26)}</span><h3>${h}</h3><p>${p}</p></div>`).join('');

  const mapPath = `/trains/${slug}/map.svg`;
  const html = `${head({ title, description, path, ogImage: null, jsonLd: [articleLd(h1, path, description, mapPath), breadcrumbLd([['Home', '/'], ['Train activity by city', '/trains/'], [L, path]])] })}
<main>
<section class="rc-hero"><div class="rc-hero-bg" style="background-image:url('${mapPath}')" aria-hidden="true"></div><div class="rc-wrap rc-hero-in">
<div class="rc-hero-main"><nav class="rc-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/trains/">Cities</a> / ${esc(L)}</nav><h1>${esc(h1)}</h1><p class="rc-lead">${lead}</p>${searchBox('addr-top', name)}<p class="rc-date">FRA data retrieved ${FETCHED_LABEL} · latest record update ${c.rev}</p></div>
<ul class="rc-glance" aria-label="${esc(name)} at a glance">${glance}</ul>
</div></section>

<section class="rc-wrap rc-sec"><h2>Where ${esc(name)}'s crossings are</h2><p class="rc-sub">Each dot is one public at-grade crossing in the FRA inventory, colored by what its record reports.</p>
<div class="rc-map-row"><figure class="rc-map"><img src="${mapPath}" width="${mapW}" height="${mapH}" alt="Dot map of public rail crossings in ${esc(L)}: ${fmt(cn)} with night trains outside a quiet zone, ${fmt(cq)} in a quiet zone, ${fmt(cd)} with daytime trains only and ${fmt(cz)} with no reported daily traffic"/><figcaption>FRA Crossing Inventory, retrieved ${FETCHED_LABEL}.${mp.o ? ` ${plural(mp.o, 'crossing')} outside the frame ${mp.o === 1 ? 'is' : 'are'} not shown.` : ''}</figcaption></figure>
<div class="rc-map-side"><div class="rc-legend"><h3>Legend</h3><ul><li><i style="background:#E8590C"></i>Night trains, no quiet zone<strong>${fmt(cn)}</strong></li><li><i style="background:#0F7B6C"></i>In a quiet zone<strong>${fmt(cq)}</strong></li><li><i style="background:#2451E6"></i>Daytime trains only<strong>${fmt(cd)}</strong></li><li><i style="background:#A3ADBF"></i>No reported daily traffic<strong>${fmt(cz)}</strong></li></ul></div><div class="rc-insights">${insights.join('')}</div></div></div></section>

${busiest}
${transitList}

<section class="rc-wrap rc-sec rc-prose"><h2>What this means for a home search in ${esc(name)}</h2>${paras.join('\n')}
<h3>Railroads with public crossings</h3><ul class="rc-chips">${railroads.map(r => `<li>${esc(r.name)} <strong>${fmt(r.k)}</strong></li>`).join('')}</ul></section>

<section class="rc-wrap rc-sec"><h2>Before you make an offer</h2><div class="rc-steps">${steps}</div><p class="rc-more">More detail: <a href="/how-many-trains-pass-near-my-house/">how many trains pass near my house</a>, <a href="/freight-train-noise-at-night/">freight train noise at night</a> and <a href="/railroad-vibration-homebuyer-checklist/">the vibration checklist</a>.</p></section>

<section class="rc-wrap rc-sec"><div class="rc-cta"><div><h2>The map shows the city. Your address shows your nights.</h2><p>Nearest crossing, day and night trains, quiet zone, speed and incident history for one property.</p></div><a class="rc-cta-link guide-button" href="/">Check an address →</a></div></section>

<section class="rc-wrap rc-sec rc-prose"><h2>Common questions about trains in ${esc(name)}</h2><div class="rc-faq">${faq}</div>
<h2>Sources and limits</h2><p>Crossing counts come from the <a href="https://data.transportation.gov/Railroads/Crossing-Inventory-Data-Form-71-Current/m2f8-22s6">FRA Crossing Inventory (Form 71, current)</a>, filtered to open, public, at-grade crossings whose inventory city is ${esc(name)} (records reported as in or near the city). Incident counts come from <a href="https://data.transportation.gov/Railroads/Highway-Rail-Grade-Crossing-Incident-Data-Form-57-/uwah-u9bn">FRA highway-rail accident reports (Form 57)</a>, ${INC_FROM}–${INC_TO}. Train counts are railroad-reported estimates with the listed count year; they are not live schedules, noise levels or safety ratings. Read our <a href="/home-surroundings-data/">source coverage and limitations</a> and <a href="/about/">corrections policy</a>.</p></section>

<section class="rc-wrap rc-sec"><h2>Compare other cities</h2><div class="rc-cities">${related}</div><p class="rc-more"><a href="/trains/">See all ${slugs.length} cities →</a></p></section>
</main>
${FOOTER}`;
  return { path, html, title, description };
}

function hubPage() {
  const path = '/trains/';
  const title = 'Train Activity by City: Crossings, Night Trains & Quiet Zones';
  const h1 = 'Train activity by city';
  const description = `Compare FRA rail crossing data for ${slugs.length} U.S. cities: crossing maps, night trains, quiet zones and the busiest railroad lines, for homebuyers.`;
  const sorted = [...slugs].sort((a, b) => label(a).localeCompare(label(b)));
  const cards = sorted.map(s => { const g = mapGeometry(s); const c = summary[s]; const qz = c.qz24 + c.qzP + c.qzC; return `<a class="rc-city" href="/trains/${s}/"><img src="/trains/${s}/map.svg" alt="" width="${g.W + 40}" height="${g.H + 40}" loading="lazy"/><strong>${esc(label(s))}</strong><span>${plural(c.n, 'crossing')} · ${pct(c.night, c.n)}% night trains · ${pct(qz, c.n)}% quiet zone</span></a>`; }).join('');
  const rows = sorted.map(s => {
    const c = summary[s]; const m = mainline[s]; const qz = c.qz24 + c.qzP + c.qzC;
    return `<tr><td><a href="/trains/${s}/">${esc(label(s))}</a></td><td class="num">${fmt(c.n)}</td><td class="num">${fmt(c.night)} <span class="muted">(${pct(c.night, c.n)}%)</span></td><td class="num">${fmt(qz)} <span class="muted">(${pct(qz, c.n)}%)</span></td><td class="num">${m.fWith < 15 || m.fMax < 5 ? '<span class="muted">Mostly transit</span>' : fmt(m.fMax)}</td><td class="num">${fmt(c.incTotal)}</td></tr>`;
  }).join('');
  const qzShare = s => pct(summary[s].qz24 + summary[s].qzP + summary[s].qzC, summary[s].n);
  const mostNight = [...slugs].sort((a, b) => pct(summary[b].night, summary[b].n) - pct(summary[a].night, summary[a].n))[0];
  const mostQz = [...slugs].sort((a, b) => qzShare(b) - qzShare(a))[0];
  const noQz = slugs.filter(s => qzShare(s) === 0 && summary[s].qz24 + summary[s].qzP + summary[s].qzC === 0).map(label);
  const html = `${head({ title, description, path, jsonLd: [articleLd(h1, path, description), breadcrumbLd([['Home', '/'], ['Train activity by city', path]])] })}
<main>
<section class="rc-hero rc-hero-hub"><div class="rc-wrap rc-hero-in"><div class="rc-hero-main"><nav class="rc-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / Cities</nav><h1>Train activity by city</h1><p class="rc-lead">How busy are the rail crossings where you're house-hunting? Crossing maps and FRA records for ${slugs.length} large U.S. cities: night trains, quiet zones and the busiest railroad lines.</p>${searchBox('addr-hub', 'U.S.')}<p class="rc-date">FRA data retrieved ${FETCHED_LABEL}</p></div>
<ul class="rc-glance" aria-label="What stands out"><li><span class="rc-ico rc-warn">${icon('moon')}</span><div><span class="rc-k">Most night trains</span><span class="rc-v">${esc(label(mostNight))} · ${pct(summary[mostNight].night, summary[mostNight].n)}% of crossings</span></div></li><li><span class="rc-ico rc-ok">${icon('mute')}</span><div><span class="rc-k">Broadest quiet zones</span><span class="rc-v">${esc(label(mostQz))} · ${qzShare(mostQz)}% of crossings</span></div></li><li><span class="rc-ico rc-neutral">${icon('alert')}</span><div><span class="rc-k">No quiet-zone crossings reported</span><span class="rc-v">${esc(noQz.join(', '))}</span></div></li></ul>
</div></section>
<section class="rc-wrap rc-sec"><h2>Pick a city</h2><p class="rc-sub">Orange dots report night trains outside a quiet zone; green dots are in a quiet zone.</p><div class="rc-cities rc-cities-hub">${cards}</div></section>
<section class="rc-wrap rc-sec"><div class="rc-card"><div class="rc-card-head"><h2>City comparison</h2></div><div class="rc-table"><table><thead><tr><th>City</th><th class="num">Public crossings</th><th class="num">Night trains</th><th class="num">Quiet zone</th><th class="num">Busiest railroad line (trains/day)</th><th class="num">Incidents 2021–26</th></tr></thead><tbody>${rows}</tbody></table></div><p class="rc-note">“Busiest railroad line” excludes light rail and transit-agency crossings. Night trains are reported between 6 PM and 6 AM.</p></div></section>
<section class="rc-wrap rc-sec rc-prose"><h2>How these numbers were built</h2><p>Records come from the <a href="https://data.transportation.gov/Railroads/Crossing-Inventory-Data-Form-71-Current/m2f8-22s6">FRA Crossing Inventory (Form 71, current)</a>: open, public, at-grade crossings whose inventory city matches each city (including records reported as near the city). Incident totals use <a href="https://data.transportation.gov/Railroads/Highway-Rail-Grade-Crossing-Incident-Data-Form-57-/uwah-u9bn">FRA Form 57 accident reports</a> from ${INC_FROM} to ${INC_TO}. Train counts are railroad-reported estimates with varying count years, not schedules. See <a href="/how-many-trains-pass-near-my-house/">how to read train counts</a> and <a href="/home-surroundings-data/">data coverage and limits</a>.</p></section>
<section class="rc-wrap rc-sec"><div class="rc-cta"><div><h2>City totals are a starting point.</h2><p>What one house hears depends on the nearest crossing, its night traffic and whether horns are restricted there.</p></div><a class="rc-cta-link guide-button" href="/">Check an address →</a></div></section>
</main>
${FOOTER}`;
  return { path, html, title, description };
}

const pages = [hubPage(), ...slugs.map(cityPage)];
for (const { path, html } of pages) {
  const dir = resolve(root, path.slice(1));
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'index.html'), html);
}
for (const s of slugs) await writeFile(resolve(root, 'trains', s, 'map.svg'), mapSvg(s).svg);

const smPath = resolve(root, 'sitemap.xml');
let sm = await readFile(smPath, 'utf8');
sm = sm.replace(/\s*<url><loc>https:\/\/railroad-home-check\.vercel\.app\/trains\/[^<]*<\/loc>(?:<lastmod>[^<]*<\/lastmod>)?<\/url>/g, '');
sm = sm.replace('</urlset>', `${pages.map(p => `  <url><loc>${ORIGIN}${p.path}</loc><lastmod>${FETCHED}</lastmod></url>`).join('\n')}\n</urlset>`);
await writeFile(smPath, sm);

console.log(`Built ${pages.length} pages and ${slugs.length} maps`);
