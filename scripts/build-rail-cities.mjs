// Builds static city train-activity pages from FRA crossing aggregates.
// Input:  data/rail-cities/{cities,summary,mainline}.json
// Output: trains/index.html, trains/<slug>/index.html, sitemap.xml entries
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

const qzLabel = code => ({ '1': '24-hour', '2': 'Partial', '3': 'Chicago-excused', '0': 'No' })[String(code)] ?? 'Not reported';
const yearLabel = y => (y && y > 1900 ? String(y) : 'Not reported');
const street = s => (s && s.trim() ? titleCase(s) : 'Unnamed crossing');

const slugs = Object.keys(meta.cities);
for (const s of slugs) {
  if (!summary[s] || !mainline[s]) throw new Error(`Missing data for ${s}`);
}
const label = s => `${meta.cities[s].name}, ${meta.cities[s].st}`;

function head({ title, description, path, jsonLd }) {
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
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css"/><link rel="stylesheet" href="/guides.css"/><link rel="stylesheet" href="/rail-cities.css"/>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
<meta property="og:type" content="article"/><meta property="og:site_name" content="Home Surroundings Check"/><meta property="og:title" content="${esc(title)}"/><meta property="og:description" content="${esc(description)}"/><meta property="og:url" content="${url}"/>
${jsonLd.map(j => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
<script defer src="/guide-analytics.js"></script></head><body>
<header class="site-header"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M5 18 20 6l15 12M10 16v18h20V16M16 34V23h8v11" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Home Surroundings Check</span></a><a class="source-link" href="/">Check an address →</a></header>`;
}
const FOOTER = `<footer><p>Data: U.S. DOT / Federal Railroad Administration crossing inventory and accident reports. Independent informational site.</p><nav class="footer-links"><a href="/trains/">Train activity by city</a> <a href="/guides/">All homebuyer guides</a> <a href="/about/">About &amp; corrections</a> <a href="/privacy.html">Privacy Policy</a></nav></footer></body></html>`;

function breadcrumbLd(items) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${ORIGIN}${path}` })) };
}
function articleLd(headline, path, description) {
  return { '@context': 'https://schema.org', '@type': 'Article', headline, description, datePublished: FETCHED, dateModified: FETCHED, mainEntityOfPage: `${ORIGIN}${path}`, author: { '@type': 'Organization', name: 'Home Surroundings Check', url: `${ORIGIN}/about/` }, publisher: { '@type': 'Organization', name: 'Home Surroundings Check' }, isBasedOn: 'https://data.transportation.gov/resource/m2f8-22s6' };
}

function crossingRows(rows, { withOperator = true } = {}) {
  return rows.map(r => `<tr><td>${esc(street(r.st))}</td>${withOperator ? `<td>${esc(rrName(r.rr))}</td>` : ''}<td class="num">${r.d}</td><td class="num">${r.n}</td><td class="num">${r.sp ? `${r.sp} mph` : '—'}</td><td>${qzLabel(r.qz)}</td><td>${yearLabel(r.y)}</td><td><a href="${crossingUrl(r.id)}" rel="nofollow">${esc(r.id)}</a></td></tr>`).join('');
}

function cityPage(slug) {
  const c = summary[slug];
  const m = mainline[slug];
  const name = meta.cities[slug].name;
  const L = label(slug);
  const path = `/trains/${slug}/`;
  const qz = c.qz24 + c.qzP + c.qzC;
  const nonMain = c.n - m.fN;
  const transitHeavy = nonMain / c.n >= 0.15;
  const nightOfActive = pct(c.night, c.withTrains);
  const fTop = m.fTop.map(([id, st, rr, d, n, sp, qzc, y]) => ({ id, st, rr, d, n, sp, qz: qzc, y }));
  const allTop = c.top.map(([id, st, rr, d, n, p, sp, qzc, y, inc]) => ({ id, st, rr, d, n, p, sp, qz: qzc, y, inc }));
  const busiest = fTop[0];
  const railroads = c.rr.map(([r, k]) => ({ name: rrName(r), raw: r, k }));
  const freightRR = railroads.filter(r => !TRANSIT_RE.test(r.raw));
  const transitRR = railroads.filter(r => TRANSIT_RE.test(r.raw));
  const oldCounts = c.withTrains - c.yRecent;
  const thin = m.fWith < 15 || m.fMax < 5;
  const topCount = thin ? c.max : m.fMax;

  const title = `Trains in ${L}: Crossings, Night Trains & Quiet Zones`;
  const h1 = `How Many Trains Run Through ${L}?`;
  const description = `FRA data for ${L}: ${fmt(c.n)} public rail crossings, ${fmt(c.night)} reporting night trains, ${fmt(qz)} in quiet zones. See the busiest crossings and what to check before buying.`;

  const answer = `The FRA crossing inventory lists <strong>${plural(c.n, 'open public at-grade crossing')}</strong> in or near ${esc(name)}. <strong>${fmt(c.withTrains)}</strong> report at least one through train per day and <strong>${fmt(c.night)}</strong> report trains between 6 PM and 6 AM. ${thin ? `Most of that activity is light rail and commuter service: a typical active crossing reports about <strong>${plural(c.med, 'train')} per day</strong>, and the busiest reports <strong>${fmt(c.max)}</strong>. Only ${fmt(m.fWith)} crossings on railroad-company lines report daily traffic.` : `On railroad-company lines (excluding transit agencies), a typical active crossing reports about <strong>${plural(m.fMed, 'train')} per day</strong>; the busiest reports <strong>${fmt(m.fMax)}</strong>.`}`;

  const p = [];
  // Night activity
  if (nightOfActive >= 85) p.push(`<p><strong>Night trains are the norm, not the exception.</strong> ${nightOfActive}% of ${esc(name)} crossings with reported traffic also report nighttime movements. If the home you are considering sits near any active line, plan at least one visit after dark.</p>`);
  else if (nightOfActive >= 50) p.push(`<p><strong>Most active lines also run at night.</strong> ${nightOfActive}% of crossings with reported traffic list nighttime trains, so a daytime showing can understate what you will hear. Visit once after 10 PM before making an offer.</p>`);
  else p.push(`<p><strong>Night activity is concentrated on fewer lines.</strong> Only ${nightOfActive}% of crossings with reported traffic list nighttime trains. Check whether the line near your shortlisted home is one of them rather than assuming the whole city is quiet at night.</p>`);
  // Quiet zones
  if (qz === 0) p.push(`<p><strong>No quiet zones appear in this set.</strong> None of the ${fmt(c.n)} public crossings is reported in an FRA quiet zone, so routine horn sounding at public crossings is the default under the federal Train Horn Rule. Distance to the nearest crossing matters more here than in cities with broad quiet-zone coverage.</p>`);
  else if (c.qzC > 0) p.push(`<p><strong>Chicago has its own horn rules.</strong> ${plural(c.qzC, 'crossing')} are reported as Chicago-excused, ${fmt(c.qz24)} as 24-hour quiet zones and ${fmt(c.qzP)} as ${c.qzP === 1 ? 'a partial quiet zone' : 'partial quiet zones'}. Quiet-zone status limits routine horn sounding but does not silence emergency horns, bells or wayside equipment. <a href="/quiet-zone-homebuyer-guide/">Read the quiet-zone guide</a>.</p>`);
  else if (pct(qz, c.n) >= 40) p.push(`<p><strong>Quiet zones cover much of the network.</strong> ${fmt(qz)} of ${fmt(c.n)} public crossings (${pct(qz, c.n)}%) are reported in 24-hour quiet zones. Engineers can still sound horns for emergencies and some crossings sit just outside a zone, so confirm the status of the specific crossing nearest the home. <a href="/quiet-zone-homebuyer-guide/">How quiet zones work</a>.</p>`);
  else p.push(`<p><strong>Quiet zones are patchy.</strong> Only ${fmt(qz)} of ${fmt(c.n)} public crossings (${pct(qz, c.n)}%) are reported in an FRA quiet zone. Two homes a few blocks apart can have very different horn exposure, so check the crossing closest to each address. <a href="/quiet-zone-homebuyer-guide/">How quiet zones work</a>.</p>`);
  // Transit
  if (transitHeavy) {
    const names = transitRR.map(r => r.name);
    p.push(`<p><strong>The highest counts here come from passenger rail.</strong> ${fmt(nonMain)} of the ${fmt(c.n)} crossings are on transit or commuter lines${names.length ? ` such as ${esc(names.slice(0, 3).join(', '))}` : ''}. Frequent, shorter trains produce the highest reported counts (up to ${fmt(c.max)} per day). ${thin ? 'Railroad-company lines report little traffic in this set, so the table below lists the busiest crossings of any operator.' : 'Railroad-company lines are summarized separately below so the two do not get mixed up.'}</p>`);
  }
  // Count freshness
  if (c.withTrains > 0 && oldCounts / c.withTrains >= 0.4) p.push(`<p><strong>Many counts are old.</strong> ${fmt(oldCounts)} of ${fmt(c.withTrains)} active crossings carry a train-count year before 2021 or no year at all (reported years range from ${c.yMin} to ${c.yMax}). Treat older numbers as a rough guide and ask the seller or neighbors about current traffic.</p>`);
  else p.push(`<p><strong>Most counts are recent.</strong> ${fmt(c.yRecent)} of ${fmt(c.withTrains)} active crossings report a train-count year of 2021 or later (range ${c.yMin}–${c.yMax}). Counts are still reported estimates, not schedules.</p>`);
  // Incidents
  p.push(`<p><strong>Crossing incidents.</strong> FRA highway-rail accident reports list ${plural(c.incTotal, 'incident')} at ${plural(c.incX, 'of these crossings', 'of these crossings')} between ${INC_FROM} and ${INC_TO}. That is a safety record for vehicles and pedestrians at the crossing, not a noise measure. <a href="/railroad-crossing-accident-history/">How to read crossing accident history</a>.</p>`);

  const rrList = railroads.map(r => `<li><strong>${esc(r.name)}</strong> — ${plural(r.k, 'crossing')}</li>`).join('');

  const busiestSentence = busiest ? `The busiest railroad-company crossing in this set is <strong>${esc(street(busiest.st))}</strong> (${esc(rrName(busiest.rr))}), reporting ${busiest.d} day and ${busiest.n} night through trains${busiest.y ? ` as of ${busiest.y}` : ''}.` : '';

  const thinBlock = `<h2>Busiest rail crossings in ${esc(name)}</h2><p>Few crossings on railroad-company lines report daily traffic here (${fmt(m.fWith)} of ${fmt(m.fN)}), so this table lists the busiest crossings of any operator. Day and night columns are reported through trains per day (6 AM–6 PM and 6 PM–6 AM).</p><div class="table-scroll"><table><thead><tr><th>Crossing street</th><th>Operator</th><th>Day</th><th>Night</th><th>Max speed</th><th>Quiet zone</th><th>Count year</th><th>FRA ID</th></tr></thead><tbody>${crossingRows(allTop.slice(0, 6))}</tbody></table></div><p class="table-note">Do not add counts from neighboring crossings: one train passes several crossings. Freight trains can also use passenger corridors, often at night, without showing up as a separate count.</p>`;
  const transitTable = !thin && transitHeavy ? `<h2>Busiest crossings including light rail and commuter lines</h2><p>These crossings report the highest totals of any operator. Light rail and commuter trains are usually shorter and may be quieter than freight, but crossing bells and horns still apply.</p><div class="table-scroll"><table><thead><tr><th>Crossing street</th><th>Operator</th><th>Day</th><th>Night</th><th>Max speed</th><th>Quiet zone</th><th>Count year</th><th>FRA ID</th></tr></thead><tbody>${crossingRows(allTop.slice(0, 5))}</tbody></table></div>` : '';

  const sameState = slugs.filter(s => s !== slug && meta.cities[s].st === meta.cities[slug].st);
  const idx = slugs.indexOf(slug);
  const others = [...sameState, ...[1, 2, 3, 4, 5].map(k => slugs[(idx + k) % slugs.length])].filter((s, i, a) => s !== slug && a.indexOf(s) === i).slice(0, 6);
  const related = others.map(s => `<a class="related-card" href="/trains/${s}/"><strong>${esc(label(s))}</strong><span>${plural(summary[s].n, 'crossing')} · ${fmt(summary[s].night)} with night trains →</span></a>`).join('');

  const faq = [
    [`Do trains run at night in ${name}?`, `Yes on most active lines: ${fmt(c.night)} of ${fmt(c.withTrains)} crossings with reported traffic list trains between 6 PM and 6 AM. Check the specific crossing near a home, because night traffic varies by line.`],
    [`Are there railroad quiet zones in ${name}?`, qz ? `${fmt(qz)} public crossings are reported in an FRA quiet zone${c.qzC ? ` (including ${fmt(c.qzC)} Chicago-excused crossings)` : ''}. Status is reported per crossing, so confirm the crossing nearest the address.` : `None of the ${fmt(c.n)} public crossings in this set is reported in an FRA quiet zone, so routine horn sounding is the default at public crossings.`],
    [`Which railroads operate in ${name}?`, `By number of public crossings: ${railroads.slice(0, 4).map(r => `${r.name} (${r.k})`).join(', ')}.`],
    [`How fast do trains go through ${name}?`, `The highest maximum timetable speed reported at these crossings is ${c.maxSpeed} mph. Many urban crossings report much lower limits; the table above lists the speed for each busy crossing.`]
  ];
  const faqHtml = faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');

  const html = `${head({ title, description, path, jsonLd: [articleLd(h1, path, description), breadcrumbLd([['Home', '/'], ['Train activity by city', '/trains/'], [L, path]])] })}
<main><section class="guide-hero"><div class="breadcrumbs"><a href="/">Home</a> / <a href="/trains/">Train activity by city</a></div><div class="eyebrow">FRA CROSSING DATA · ${esc(meta.cities[slug].st)}</div><h1>${esc(h1)}</h1><p class="lead">${answer}</p><p class="data-date">Data retrieved ${FETCHED_LABEL} from the FRA crossing inventory (latest record update ${c.rev}).</p><p><a class="guide-quick-check" href="/">Check a specific ${esc(name)} address →</a></p></section>
<section class="guide-shell"><article class="guide-content">
<div class="stat-grid">
<div class="stat"><span class="stat-num">${fmt(c.n)}</span><span class="stat-label">Public at-grade crossings</span></div>
<div class="stat"><span class="stat-num">${fmt(c.night)}</span><span class="stat-label">Report night trains (6 PM–6 AM)</span></div>
<div class="stat"><span class="stat-num">${fmt(qz)}</span><span class="stat-label">In an FRA quiet zone</span></div>
<div class="stat"><span class="stat-num">${fmt(topCount)}</span><span class="stat-label">${thin ? 'Highest reported count, any operator (trains/day)' : 'Highest railroad-line count (trains/day)'}</span></div>
<div class="stat"><span class="stat-num">${fmt(c.maxSpeed)} mph</span><span class="stat-label">Highest timetable speed</span></div>
<div class="stat"><span class="stat-num">${fmt(c.incTotal)}</span><span class="stat-label">Crossing incidents, 2021–2026</span></div>
</div>
<h2>What this means for a home search in ${esc(name)}</h2>
${p.join('\n')}
${thin ? thinBlock : `<h2>Busiest railroad-line crossings in ${esc(name)}</h2>
<p>${busiestSentence} Day and night columns are reported through trains per day (6 AM–6 PM and 6 PM–6 AM). Transit-agency crossings are excluded; commuter or passenger trains may still share these tracks.</p>
<div class="table-scroll"><table><thead><tr><th>Crossing street</th><th>Railroad</th><th>Day</th><th>Night</th><th>Max speed</th><th>Quiet zone</th><th>Count year</th><th>FRA ID</th></tr></thead><tbody>${crossingRows(fTop)}</tbody></table></div>
<p class="table-note">${fmt(m.fWith)} of ${fmt(m.fN)} railroad-line crossings report daily traffic; the median among them is ${plural(m.fMed, 'train')} per day. Do not add counts from neighboring crossings: one train passes several crossings.</p>
` }${transitTable}
<h2>Railroads with public crossings in ${esc(name)}</h2>
<ul class="rr-list">${rrList}</ul>
${freightRR.length && transitRR.length ? `<p>Freight and railroad-company operators (${esc(freightRR.slice(0, 3).map(r => r.name).join(', '))}) usually run longer, heavier trains than transit operators, which matters for rumble and vibration as well as horns. <a href="/railroad-vibration-homebuyer-checklist/">Vibration checklist</a>.</p>` : `<p>Longer, heavier freight trains matter for rumble and vibration as well as horns. <a href="/railroad-vibration-homebuyer-checklist/">Vibration checklist</a>.</p>`}
<div class="guide-cta"><h2>Check a specific ${esc(name)} address</h2><p>City totals cannot tell you what one house will hear. Enter an address to see the nearest reported crossing, its day and night trains, quiet-zone status, speed and incident history.</p><a class="guide-button" href="/">Check an address</a></div>
<h2>How to check a home near the tracks in ${esc(name)}</h2>
<ol><li>Look up the address and find the nearest public crossing, not just the nearest track.</li><li>Note the day and night counts, quiet-zone status and count year for that crossing ID.</li><li>Visit once in daytime and once after 10 PM; stand outside and inside with windows closed.</li><li>Ask the seller or neighbors whether traffic has changed since the count year.</li></ol>
<p>More detail: <a href="/how-many-trains-pass-near-my-house/">how many trains pass near my house</a>, <a href="/train-horns-near-house/">train horns near a house</a> and <a href="/freight-train-noise-at-night/">freight train noise at night</a>.</p>
<h2>Common questions about trains in ${esc(name)}</h2>
<div class="faq-list">${faqHtml}</div>
<h2>Sources and limits</h2>
<p>Crossing counts come from the <a href="https://data.transportation.gov/Railroads/Crossing-Inventory-Data-Form-71-Current/m2f8-22s6">FRA Crossing Inventory (Form 71, current)</a>, filtered to open, public, at-grade crossings whose inventory city is ${esc(name)} (records reported as in or near the city). Incident counts come from <a href="https://data.transportation.gov/Railroads/Highway-Rail-Grade-Crossing-Incident-Data-Form-57-/uwah-u9bn">FRA highway-rail accident reports (Form 57)</a>, ${INC_FROM}–${INC_TO}. Train counts are railroad-reported estimates with the listed count year; they are not live schedules, noise levels or safety ratings. Some records omit a count year or use placeholder values. Read our <a href="/home-surroundings-data/">source coverage and limitations</a> and <a href="/about/">corrections policy</a>.</p>
</article></section></main>
<section class="related-guides"><div class="eyebrow">OTHER CITIES</div><h2>Compare train activity in other cities</h2><div class="related-grid">${related}</div><p class="hub-link"><a href="/trains/">See all ${slugs.length} cities →</a></p></section>
${FOOTER}`;
  return { path, html, title, description };
}

function hubPage() {
  const path = '/trains/';
  const title = 'Train Activity by City: Crossings, Night Trains & Quiet Zones';
  const h1 = 'Train Activity by City';
  const description = `Compare FRA rail crossing data for ${slugs.length} U.S. cities: public crossings, night trains, quiet zones and the busiest railroad lines, for homebuyers.`;
  const sorted = [...slugs].sort((a, b) => label(a).localeCompare(label(b)));
  const rows = sorted.map(s => {
    const c = summary[s]; const m = mainline[s]; const qz = c.qz24 + c.qzP + c.qzC;
    return `<tr><td><a href="/trains/${s}/">${esc(label(s))}</a></td><td class="num">${fmt(c.n)}</td><td class="num">${fmt(c.night)} <span class="muted">(${pct(c.night, c.n)}%)</span></td><td class="num">${fmt(qz)} <span class="muted">(${pct(qz, c.n)}%)</span></td><td class="num">${m.fWith < 15 || m.fMax < 5 ? '<span class="muted">Mostly transit</span>' : fmt(m.fMax)}</td><td class="num">${fmt(c.incTotal)}</td></tr>`;
  }).join('');
  const mostNight = [...slugs].sort((a, b) => pct(summary[b].night, summary[b].n) - pct(summary[a].night, summary[a].n))[0];
  const mostQz = [...slugs].sort((a, b) => pct(summary[b].qz24 + summary[b].qzP + summary[b].qzC, summary[b].n) - pct(summary[a].qz24 + summary[a].qzP + summary[a].qzC, summary[a].n))[0];
  const noQz = slugs.filter(s => summary[s].qz24 + summary[s].qzP + summary[s].qzC === 0).map(label);
  const html = `${head({ title, description, path, jsonLd: [articleLd(h1, path, description), breadcrumbLd([['Home', '/'], ['Train activity by city', path]])] })}
<main><section class="guide-hero"><div class="breadcrumbs"><a href="/">Home</a> / <a href="/guides/">Homebuyer guides</a></div><div class="eyebrow">FRA CROSSING DATA</div><h1>${h1}</h1><p class="lead">How busy are the railroad crossings in your city? This table summarizes FRA records for open public at-grade crossings in ${slugs.length} large U.S. cities: how many report night trains, how many sit in quiet zones and the highest daily count on railroad-company lines.</p><p class="data-date">Data retrieved ${FETCHED_LABEL}.</p><p><a class="guide-quick-check" href="/">Check a specific address →</a></p></section>
<section class="guide-shell"><article class="guide-content">
<h2>City comparison</h2>
<div class="table-scroll"><table><thead><tr><th>City</th><th>Public crossings</th><th>Night trains</th><th>Quiet zone</th><th>Busiest railroad line (trains/day)</th><th>Incidents 2021–2026</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="table-note">“Busiest railroad line” excludes light rail and transit-agency crossings. Night trains are reported between 6 PM and 6 AM.</p>
<h2>What stands out</h2>
<ul><li><strong>${esc(label(mostNight))}</strong> has the highest share of crossings reporting night trains (${pct(summary[mostNight].night, summary[mostNight].n)}%).</li><li><strong>${esc(label(mostQz))}</strong> has the broadest quiet-zone coverage (${pct(summary[mostQz].qz24 + summary[mostQz].qzP + summary[mostQz].qzC, summary[mostQz].n)}% of public crossings).</li>${noQz.length ? `<li>No public crossing is reported in a quiet zone in ${esc(noQz.join(', '))}.</li>` : ''}</ul>
<p>City totals are a starting point. What one house hears depends on the nearest crossing, the line's night traffic and whether horns are restricted there.</p>
<div class="guide-cta"><h2>Check a U.S. property address</h2><p>See the nearest reported crossing, day and night trains, quiet-zone status, speed and incident history for one address.</p><a class="guide-button" href="/">Check an address</a></div>
<h2>How these numbers were built</h2>
<p>Records come from the <a href="https://data.transportation.gov/Railroads/Crossing-Inventory-Data-Form-71-Current/m2f8-22s6">FRA Crossing Inventory (Form 71, current)</a>: open, public, at-grade crossings whose inventory city matches each city (including records reported as near the city). Incident totals use <a href="https://data.transportation.gov/Railroads/Highway-Rail-Grade-Crossing-Incident-Data-Form-57-/uwah-u9bn">FRA Form 57 accident reports</a> from ${INC_FROM} to ${INC_TO}. Train counts are railroad-reported estimates with varying count years, not schedules. See <a href="/how-many-trains-pass-near-my-house/">how to read train counts</a> and <a href="/home-surroundings-data/">data coverage and limits</a>.</p>
</article></section></main>
${FOOTER}`;
  return { path, html, title, description };
}

const pages = [hubPage(), ...slugs.map(cityPage)];
for (const { path, html } of pages) {
  const dir = resolve(root, path.slice(1));
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'index.html'), html);
}

// Sitemap: add or refresh /trains/ URLs, keep everything else untouched.
const smPath = resolve(root, 'sitemap.xml');
let sm = await readFile(smPath, 'utf8');
sm = sm.replace(/\s*<url><loc>https:\/\/railroad-home-check\.vercel\.app\/trains\/[^<]*<\/loc>(?:<lastmod>[^<]*<\/lastmod>)?<\/url>/g, '');
const entries = pages.map(p => `  <url><loc>${ORIGIN}${p.path}</loc><lastmod>${FETCHED}</lastmod></url>`).join('\n');
sm = sm.replace('</urlset>', `${entries}\n</urlset>`);
await writeFile(smPath, sm);

console.log(`Built ${pages.length} pages`);
for (const p of pages) console.log(p.path, '|', p.title.length, 'chars |', p.description.length, 'desc');
