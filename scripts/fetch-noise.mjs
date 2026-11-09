// Transportation noise around each /trains/ city, from the USDOT/BTS National Transportation Noise Map (2020).
// Runs in GitHub Actions (.github/workflows/noise-data.yml). For every map pixel (~30 m) within RADIUS_MI of the
// city's center point, reads the legend band of the road, rail, aviation and combined layers and stores the share
// of land in each band (per mille). Writes data/noise/cities.json.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Z, BANDS, servicesFor, worldPx, pxToLonLat, fetchTile, bandOf, pointBands } from '../lib/noise.js';

const RADIUS_MI = 3;
const maps = JSON.parse(await readFile('data/rail-cities/maps.json', 'utf8'));
const cities = JSON.parse(await readFile('data/rail-cities/cities.json', 'utf8')).cities;
const R = RADIUS_MI * 1609.344;
const metersBetween = (a, b, c, d) => { const t = Math.PI / 180; const x = (d - b) * t * Math.cos((a + c) / 2 * t), y = (c - a) * t; return Math.hypot(x, y) * 6371008; };

// quick sanity check that tiles decode and colors map to bands
console.log('Houston downtown', JSON.stringify(await pointBands(29.7604, -95.3698)));
console.log('LAX area', JSON.stringify(await pointBands(33.9530, -118.3530)));

const LAYERS = ['all', 'road', 'rail', 'aviation'];
async function city(slug) {
  const dt = maps[slug]?.dt;
  if (!dt) return null;
  const [lat, lon] = dt, s = servicesFor(lat, lon);
  if (!s) return null;
  // pixel window around the center
  const dLat = R / 111320, dLon = R / (111320 * Math.cos(lat * Math.PI / 180));
  const a = worldPx(lon - dLon, lat + dLat), b = worldPx(lon + dLon, lat - dLat);
  const x0 = Math.floor(a.x), y0 = Math.floor(a.y), x1 = Math.ceil(b.x), y1 = Math.ceil(b.y);
  const tiles = [];
  for (let ty = Math.floor(y0 / 256); ty <= Math.floor(y1 / 256); ty++) for (let tx = Math.floor(x0 / 256); tx <= Math.floor(x1 / 256); tx++) tiles.push([tx, ty]);
  const out = {};
  for (const L of LAYERS) {
    if (!s[L]) { out[L] = null; continue; }
    const imgs = new Map();
    await Promise.all(tiles.map(async ([tx, ty]) => imgs.set(`${tx}/${ty}`, await fetchTile(s[L], Z, tx, ty, { timeout: 30000, tries: 4 }))));
    const counts = new Array(BANDS.length).fill(0);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const p = pxToLonLat(x + 0.5, y + 0.5);
      if (metersBetween(lat, lon, p.lat, p.lon) > R) continue;
      const tx = Math.floor(x / 256), ty = Math.floor(y / 256), img = imgs.get(`${tx}/${ty}`);
      counts[img ? bandOf(...img.rgba(x - tx * 256, y - ty * 256)) : 0]++;
    }
    const n = counts.reduce((m, v) => m + v, 0);
    out[L] = counts.map(v => Math.round(v / n * 1000)); // per mille of land/water in the circle
    out.px = n;
  }
  const center = await pointBands(lat, lon);
  return { region: s.region, ...out, center: center ? { all: center.all, road: center.road, rail: center.rail, aviation: center.aviation } : null };
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
for (const k of ['houston-tx', 'chicago-il', 'los-angeles-ca', 'anchorage-ak']) if (result[k]) console.log(k, JSON.stringify(result[k]));
await mkdir('data/noise', { recursive: true });
await writeFile('data/noise/cities.json', JSON.stringify({
  fetchedOn: new Date().toISOString().slice(0, 10), radiusMi: RADIUS_MI, year: 2020,
  bands: BANDS.map(b => b.label),
  source: 'USDOT Bureau of Transportation Statistics, National Transportation Noise Map (2020), 24-hour LAeq',
  cities: result
}) + '\n');
