// Builds data/rail-cities/*.json for the /trains/ city pages from public sources.
// Runs in GitHub Actions (.github/workflows/rail-data.yml); needs /tmp/pop.csv and /tmp/gaz.txt (downloaded by the workflow).
//   FRA Form 71 crossing inventory (m2f8-22s6), FRA Form 57 incidents (uwah-u9bn),
//   Census Vintage 2023 city population estimates (sub-est2023), Census 2023 Gazetteer places (city center point).
import { readFile, writeFile } from 'node:fs/promises';

const DIR = 'data/rail-cities';
const FETCHED_ON = new Date().toISOString().slice(0, 10);
const INC_FROM = '2021-01-01', INC_TO = '2026-08-31';
const MIN_POP = Number(process.env.MIN_POP || 40000);
const MAX_CITIES = Number(process.env.MAX_CITIES || 300);
const MIN_CROSSINGS = 15, MIN_ACTIVE = 8;
const FILTER = "crossingclosed='No' AND crossingpositioncode='1' AND crossingtypecode='3'";
const SOCRATA = 'https://data.transportation.gov/resource';

const STATES = { ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA', COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', 'DISTRICT OF COLUMBIA': 'DC', FLORIDA: 'FL', GEORGIA: 'GA', HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV', WISCONSIN: 'WI', WYOMING: 'WY' };
const TRANSIT_RE = /transit|trolley|metro|rapid|light rail|trimet|regional transportation district|\bRTD\b|tex ?rail|capital metropolitan|utah transit|frontrunner|commuter|metra|southeastern pennsylvania|southern california regional|coaster|sprinter|trinity railway|amtrak|passenger|mts|septa|dart/i;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function soql(dataset, params, tries = 4) {
  const url = `${SOCRATA}/${dataset}.json?${new URLSearchParams(params)}`;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'railroad-home-check data refresh' } });
      if (r.ok) return await r.json();
      console.warn('soql', r.status, (await r.text()).slice(0, 200));
    } catch (e) { console.warn('soql error', e.message); }
    await sleep(1500 * (i + 1));
  }
  throw new Error(`Socrata failed: ${url}`);
}

// "St. Louis city" / "Nashville-Davidson metropolitan government (balance)" / "SAINT PAUL" -> comparable keys
function keys(name) {
  let n = name.toLowerCase().replace(/\(balance\)/g, '').replace(/\b(city|town|village|borough|municipality|cdp|township|charter township|plantation|metropolitan government|unified government|consolidated government|urban county|metro government|corporation)\b/g, '')
    .replace(/\bsaint\b/g, 'st').replace(/\bfort\b/g, 'ft').replace(/\bmount\b/g, 'mt').replace(/[.'’]/g, '').replace(/\s+/g, ' ').trim();
  const out = [n.replace(/[^a-z0-9]+/g, '')];
  for (const part of n.split(/[-/]/)) if (part.trim()) out.push(part.replace(/[^a-z0-9]+/g, ''));
  return [...new Set(out)];
}
const slugify = s => s.toLowerCase().replace(/[.'’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

// ---------- population + city center ----------
function parseCsv(line) { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; }
const popText = new TextDecoder('latin1').decode(await readFile('/tmp/pop.csv'));
const [popHead, ...popRows] = popText.split(/\r?\n/).filter(Boolean);
const PH = parseCsv(popHead), iS = PH.indexOf('SUMLEV'), iN = PH.indexOf('NAME'), iST = PH.indexOf('STNAME'), iP = PH.indexOf('POPESTIMATE2023');
const pop = new Map(); // "TX|houston" -> {name, pop}
for (const line of popRows) {
  const r = parseCsv(line);
  if (!['162', '170'].includes(r[iS])) continue;
  const st = STATES[r[iST].toUpperCase()]; if (!st) continue;
  const clean = r[iN].replace(/\s*\(balance\)/, '').replace(/ (city|town|village|borough|municipality|metropolitan government|unified government|consolidated government|metro government|urban county)$/i, '').replace(/-Davidson$/, '').replace(/\/Jefferson County$/, '').replace(/ city and county$/i, '').trim();
  const rec = { name: clean, pop: num(r[iP]) };
  for (const k of keys(r[iN])) { const key = `${st}|${k}`; if (!pop.has(key) || pop.get(key).pop < rec.pop) pop.set(key, rec); }
}
const gaz = new Map();
for (const line of (await readFile('/tmp/gaz.txt', 'utf8')).split(/\r?\n/).slice(1)) {
  const c = line.split('\t').map(s => s.trim()); if (c.length < 12) continue;
  for (const k of keys(c[3])) { const key = `${c[0]}|${k}`; if (!gaz.has(key)) gaz.set(key, [Number(c[10]), Number(c[11])]); }
}
console.log('population places', pop.size, 'gazetteer places', gaz.size);

// ---------- candidate cities ----------
const groups = await soql('m2f8-22s6', { $select: 'citycode,cityname,statename,count(*) as n', $where: FILTER, $group: 'citycode,cityname,statename', $limit: '50000' });
const byPlace = new Map();
for (const g of groups) {
  const st = STATES[(g.statename || '').toUpperCase()]; if (!st || !g.cityname) continue;
  let match = null;
  for (const k of keys(g.cityname)) if (pop.has(`${st}|${k}`)) { match = pop.get(`${st}|${k}`); break; }
  if (!match) continue;
  const id = `${st}|${match.name}`;
  if (!byPlace.has(id)) byPlace.set(id, { st, name: match.name, pop: match.pop, codes: [], n: 0 });
  const p = byPlace.get(id); p.codes.push(g.citycode); p.n += num(g.n);
}
const old = JSON.parse(await readFile(`${DIR}/cities.json`, 'utf8'));
const oldMaps = JSON.parse(await readFile(`${DIR}/maps.json`, 'utf8'));
const oldSummary = JSON.parse(await readFile(`${DIR}/summary.json`, 'utf8'));
const oldBySt = new Map(Object.entries(old.cities).map(([slug, c]) => [`${c.st}|${c.name}`, slug]));
let candidates = [...byPlace.values()].filter(p => p.n >= MIN_CROSSINGS && (p.pop >= MIN_POP || oldBySt.has(`${p.st}|${p.name}`)));
candidates.sort((a, b) => b.pop - a.pop);
console.log('candidates', candidates.length);

// ---------- incidents (Form 57) ----------
const inc = new Map();
for (let offset = 0; ; offset += 50000) {
  const rows = await soql('uwah-u9bn', { $select: 'gradecrossingid,count(*) as n', $where: `date >= '${INC_FROM}T00:00:00' AND date <= '${INC_TO}T23:59:59' AND gradecrossingid IS NOT NULL`, $group: 'gradecrossingid', $limit: '50000', $offset: String(offset) });
  for (const r of rows) inc.set(r.gradecrossingid, num(r.n));
  if (rows.length < 50000) break;
}
console.log('crossings with incidents', inc.size);

// ---------- per city ----------
const FIELDS = 'crossingid,street,railroadname,totaldaylightthrutrains,totalnighttimethrutrains,totaltransittrains,numberpassengertrainperday,maximumtimetablespeed,whistlebancode,trainsperyear,countroadwaygatearms,revisiondate,latitude,longitude,citycode,countyname';
const cities = {}, summary = {}, mainline = {}, maps = {};
const usedSlugs = new Set();
for (const p of candidates) {
  if (Object.keys(cities).length >= MAX_CITIES) break;
  const where = `${FILTER} AND citycode in(${p.codes.map(c => `'${c}'`).join(',')})`;
  const rows = await soql('m2f8-22s6', { $select: FIELDS, $where: where, $limit: '20000' });
  await sleep(250);
  const X = rows.map(r => {
    const day = num(r.totaldaylightthrutrains), night = num(r.totalnighttimethrutrains);
    return { id: r.crossingid, st: r.street || '', rr: r.railroadname || '', day, night, tot: day + night, transit: num(r.totaltransittrains), pass: num(r.numberpassengertrainperday),
      spd: num(r.maximumtimetablespeed), qz: String(r.whistlebancode ?? ''), yr: num(r.trainsperyear), gates: num(r.countroadwaygatearms), rev: (r.revisiondate || '').slice(0, 10),
      lat: Number(r.latitude), lon: Number(r.longitude), inc: inc.get(r.crossingid) || 0, county: r.countyname || '' };
  });
  const active = X.filter(x => x.tot > 0);
  if (X.length < MIN_CROSSINGS || active.length < MIN_ACTIVE) continue;
  const prevSlug = oldBySt.get(`${p.st}|${p.name}`);
  let slug = prevSlug || `${slugify(p.name)}-${p.st.toLowerCase()}`;
  if (usedSlugs.has(slug)) continue;
  usedSlugs.add(slug);

  const rrCount = new Map(); X.forEach(x => rrCount.set(x.rr, (rrCount.get(x.rr) || 0) + 1));
  const years = active.map(x => x.yr).filter(y => y > 1900);
  const order = (a, b) => b.tot - a.tot || b.night - a.night;
  const counties = new Map(); X.forEach(x => counties.set(x.county, (counties.get(x.county) || 0) + 1));
  summary[slug] = {
    city: p.name.toUpperCase(), state: Object.keys(STATES).find(k => STATES[k] === p.st), county: [...counties].sort((a, b) => b[1] - a[1])[0]?.[0] || '',
    n: X.length, withTrains: active.length, night: X.filter(x => x.night > 0).length,
    t10: X.filter(x => x.tot >= 10).length, t30: X.filter(x => x.tot >= 30).length,
    qz24: X.filter(x => x.qz === '1').length, qzP: X.filter(x => x.qz === '2').length, qzC: X.filter(x => x.qz === '3').length,
    pass: X.filter(x => x.pass > 0).length, transit: X.filter(x => x.transit > 0).length, gates: X.filter(x => x.gates > 0).length,
    med: median(active.map(x => x.tot)), max: Math.max(0, ...X.map(x => x.tot)), maxSpeed: Math.max(0, ...X.map(x => x.spd)),
    rr: [...rrCount].sort((a, b) => b[1] - a[1]).slice(0, 6),
    yMin: years.length ? Math.min(...years) : null, yMax: years.length ? Math.max(...years) : null, yRecent: active.filter(x => x.yr >= 2021).length,
    incTotal: X.reduce((s, x) => s + x.inc, 0), incX: X.filter(x => x.inc > 0).length,
    rev: X.map(x => x.rev).sort().pop() || '',
    top: [...active].sort(order).slice(0, 8).map(x => [x.id, x.st, x.rr, x.day, x.night, x.pass, x.spd, x.qz, x.yr, x.inc])
  };
  const M = X.filter(x => !TRANSIT_RE.test(x.rr) && x.transit === 0), MA = M.filter(x => x.tot > 0);
  mainline[slug] = { fN: M.length, fWith: MA.length, fNight: M.filter(x => x.night > 0).length, fMed: median(MA.map(x => x.tot)), fMax: Math.max(0, ...M.map(x => x.tot)),
    fTop: [...MA].sort(order).slice(0, 6).map(x => [x.id, x.st, x.rr, x.day, x.night, x.spd, x.qz, x.yr]) };

  // map: drop far-off points (records "near" the city can sit 20+ miles out), then quantize to 0-255 inside the box
  const pts = X.filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon) && x.lat !== 0);
  const mLat = median(pts.map(x => x.lat * 1e5)) / 1e5, mLon = median(pts.map(x => x.lon * 1e5)) / 1e5;
  const k = Math.cos(mLat * Math.PI / 180);
  const dist = x => Math.hypot((x.lat - mLat) * 111, (x.lon - mLon) * 111 * k);
  const d90 = [...pts.map(dist)].sort((a, b) => a - b)[Math.floor(pts.length * 0.9)] || 0;
  const keep = pts.filter(x => dist(x) <= Math.max(12, d90 * 1.8));
  let la0 = Math.min(...keep.map(x => x.lat)), la1 = Math.max(...keep.map(x => x.lat)), lo0 = Math.min(...keep.map(x => x.lon)), lo1 = Math.max(...keep.map(x => x.lon));
  const padLa = Math.max((la1 - la0) * 0.04, 0.01), padLo = Math.max((lo1 - lo0) * 0.04, 0.01);
  la0 -= padLa; la1 += padLa; lo0 -= padLo; lo1 += padLo;
  const cat = x => (['1', '2', '3'].includes(x.qz) ? 3 : x.night > 0 ? 2 : x.tot > 0 ? 1 : 0);
  const bytes = [];
  const c4 = [0, 0, 0, 0];
  for (const x of keep) { c4[cat(x)]++; bytes.push(Math.round((x.lon - lo0) / (lo1 - lo0) * 255), Math.round((la1 - x.lat) / (la1 - la0) * 255), cat(x)); }
  let dt = oldMaps[slug]?.dt || null;
  if (!dt) for (const kk of keys(p.name)) { if (gaz.has(`${p.st}|${kk}`)) { dt = gaz.get(`${p.st}|${kk}`); break; } }
  if (!dt) dt = [mLat, mLon];
  const r4 = v => Math.round(v * 1e4) / 1e4;
  maps[slug] = { b: [r4(la0), r4(la1), r4(lo0), r4(lo1)], dt: [r4(dt[0]), r4(dt[1])], c: [c4[0], c4[1], c4[2], c4[3]], o: pts.length - keep.length, p: Buffer.from(bytes).toString('base64') };
  cities[slug] = { code: p.codes.join(','), name: p.name, st: p.st, pop: p.pop, center: oldMaps[slug] ? 'downtown' : 'city' };
  console.log(slug, p.pop, X.length, active.length);
}

// sanity check against the previous snapshot
for (const slug of Object.keys(oldSummary)) {
  const a = oldSummary[slug], b = summary[slug];
  console.log('CHECK', slug, b ? `n ${a.n}->${b.n} night ${a.night}->${b.night} qz ${a.qz24 + a.qzP + a.qzC}->${b.qz24 + b.qzP + b.qzC} inc ${a.incTotal}->${b.incTotal}` : 'MISSING');
}
const out = { fetchedOn: FETCHED_ON, incidentWindow: { from: INC_FROM, to: INC_TO }, filters: old.filters, cities };
await writeFile(`${DIR}/cities.json`, JSON.stringify(out, null, 1));
await writeFile(`${DIR}/summary.json`, JSON.stringify(summary));
await writeFile(`${DIR}/mainline.json`, JSON.stringify(mainline));
await writeFile(`${DIR}/maps.json`, JSON.stringify(maps));
console.log('cities written', Object.keys(cities).length);
