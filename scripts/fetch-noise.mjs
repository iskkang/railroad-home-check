// Transportation noise exposure for each /trains/ city, from the USDOT/BTS National Transportation Noise Map (2020).
// Runs in GitHub Actions (.github/workflows/noise-data.yml).
//   1. City limits: Census TIGERweb 2020 incorporated place (or CDP) containing the city's center point.
//   2. Residents: 2020 census block groups inside those limits, each placed at its population center (Census CenPop2020).
//   3. Noise: the legend band of the road, rail, aviation and combined layers at each population center.
// Stores the population-weighted share (per mille) of residents in each band. Writes data/noise/cities.json.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Z, BANDS, servicesFor, worldPx, fetchTile, bandOf, pointBands } from '../lib/noise.js';

const maps = JSON.parse(await readFile('data/rail-cities/maps.json', 'utf8'));
const cities = JSON.parse(await readFile('data/rail-cities/cities.json', 'utf8')).cities;
const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, as = 'json', tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': 'RailroadHomeCheck/0.1' }, signal: AbortSignal.timeout(60000) }); if (r.ok) return as === 'json' ? await r.json() : await r.text(); if (r.status === 404) return null; } catch {}
    await sleep(1500 * (i + 1));
  }
  return null;
}

console.log('Houston downtown', JSON.stringify(await pointBands(29.7604, -95.3698)));

// ---------- block-group population centers ----------
const STATE_FP = [...new Set(Object.values(cities).map(c => c.code.slice(0, 2)))];
const bgs = new Map(); // statefp -> [{pop, lat, lon}]
function parseCenPop(t) {
  const lines = t.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const H = lines[0].split(',').map(s => s.trim().toUpperCase());
  const iS = H.indexOf('STATEFP'), iP = H.indexOf('POPULATION'), iLa = H.indexOf('LATITUDE'), iLo = H.indexOf('LONGITUDE');
  for (const line of lines.slice(1)) {
    const c = line.split(','), st = c[iS].padStart(2, '0'), pop = Number(c[iP]);
    if (!pop) continue;
    if (!bgs.has(st)) bgs.set(st, []);
    bgs.get(st).push({ pop, lat: Number(c[iLa]), lon: Number(c[iLo]) });
  }
}
const nat = await get('https://www2.census.gov/geo/docs/reference/cenpop2020/blkgrp/CenPop2020_Mean_BG.txt', 'text');
if (nat) parseCenPop(nat);
else for (const st of STATE_FP) { const t = await get(`https://www2.census.gov/geo/docs/reference/cenpop2020/blkgrp/CenPop2020_Mean_BG${st}.txt`, 'text'); if (t) parseCenPop(t); }
console.log('block groups loaded', [...bgs.values()].reduce((m, a) => m + a.length, 0), 'states', bgs.size);

// ---------- city limits ----------
async function place(lat, lon) {
  for (const layer of [25, 26]) { // Census 2020 incorporated places, then census designated places
    const p = new URLSearchParams({ f: 'json', geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'GEOID,NAME', returnGeometry: 'true', outSR: '4326', maxAllowableOffset: '0.0003' });
    const j = await get(`${TIGER}/${layer}/query?${p}`);
    const f = j?.features?.[0];
    if (f?.geometry?.rings?.length) return { geoid: f.attributes.GEOID, name: f.attributes.NAME, rings: f.geometry.rings };
  }
  return null;
}
function inside(rings, x, y) { // even-odd rule over all rings handles holes
  let c = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const LAYERS = ['all', 'road', 'rail', 'aviation'];
async function city(slug) {
  const dt = maps[slug]?.dt, st = cities[slug].code.slice(0, 2);
  if (!dt) return null;
  const [lat, lon] = dt, s = servicesFor(lat, lon);
  if (!s) return null;
  const pl = await place(lat, lon);
  if (!pl) { console.log('no place polygon', slug); return null; }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of pl.rings) for (const [x, y] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const pts = (bgs.get(st) || []).filter(b => b.lon >= x0 && b.lon <= x1 && b.lat >= y0 && b.lat <= y1 && inside(pl.rings, b.lon, b.lat));
  if (pts.length < 5) { console.log('too few block groups', slug, pts.length); return null; }
  const tiles = new Map();
  const tile = (svc, tx, ty) => { const k = `${svc}/${tx}/${ty}`; if (!tiles.has(k)) tiles.set(k, fetchTile(svc, Z, tx, ty, { timeout: 30000, tries: 4 })); return tiles.get(k); };
  const out = { place: { geoid: pl.geoid, name: pl.name }, bgs: pts.length, pop: pts.reduce((m, p) => m + p.pop, 0) };
  for (const L of LAYERS) {
    if (!s[L]) { out[L] = null; continue; }
    const w = new Array(BANDS.length).fill(0);
    await Promise.all(pts.map(async p => {
      const { x, y } = worldPx(p.lon, p.lat), tx = Math.floor(x / 256), ty = Math.floor(y / 256);
      const img = await tile(s[L], tx, ty);
      w[img ? bandOf(...img.rgba(Math.floor(x) - tx * 256, Math.floor(y) - ty * 256)) : 0] += p.pop;
    }));
    out[L] = w.map(v => Math.round(v / out.pop * 1000)); // per mille of residents
  }
  return { region: s.region, ...out };
}

const result = {};
const slugs = Object.keys(cities);
let done = 0, failed = 0;
const queue = [...slugs];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const slug = queue.shift();
    try { const r = await city(slug); if (r) result[slug] = r; } catch (e) { failed++; console.log('fail', slug, e.message); }
    if (++done % 25 === 0) console.log(done, '/', slugs.length);
  }
}));
console.log('cities with noise data', Object.keys(result).length, 'failed', failed);
for (const k of ['houston-tx', 'chicago-il', 'anchorage-ak', 'portland-me', 'corpus-christi-tx', 'honolulu-hi']) if (result[k]) console.log(k, JSON.stringify(result[k]));
await mkdir('data/noise', { recursive: true });
await writeFile('data/noise/cities.json', JSON.stringify({
  fetchedOn: new Date().toISOString().slice(0, 10), year: 2020, method: 'population-weighted, 2020 census block-group population centers inside city limits',
  bands: BANDS.map(b => b.label),
  source: 'USDOT Bureau of Transportation Statistics, National Transportation Noise Map (2020), 24-hour LAeq; U.S. Census Bureau TIGERweb and CenPop2020',
  cities: result
}) + '\n');
