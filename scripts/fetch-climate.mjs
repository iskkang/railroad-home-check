// Climate + natural-hazard facts for the /trains/ city pages. Runs in GitHub Actions (.github/workflows/climate-data.yml).
//   NOAA U.S. Climate Normals 1991-2020 (annual/seasonal), nearest station with complete temperature records
//   FEMA National Risk Index (county ratings at the city's center point)
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const cities = JSON.parse(await readFile('data/rail-cities/cities.json', 'utf8')).cities;
const maps = JSON.parse(await readFile('data/rail-cities/maps.json', 'utf8'));
const NORMALS = 'https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/access/';
const NRI_COUNTY = 'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0/query';
const HAZ = ['HWAV', 'CWAV', 'WNTW', 'ISTM', 'HRCN', 'TRND', 'IFLD', 'CFLD', 'WFIR'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function text(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (r.ok) return await r.text(); if (r.status === 404) return null; } catch {}
    await sleep(1000 * (i + 1));
  }
  return null;
}
function csvRow(line) { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(s => s.trim()); }
const km = (a, b, c, d) => { const R = 6371, t = Math.PI / 180; const x = (d - b) * t * Math.cos((a + c) / 2 * t), y = (c - a) * t; return Math.hypot(x, y) * R; };

// stations that have annual/seasonal normals
const listing = await text(NORMALS);
const have = new Set([...listing.matchAll(/href="([A-Z0-9]{11})\.csv"/g)].map(m => m[1]));
const coords = [];
for (const line of (await text('https://www.ncei.noaa.gov/pub/data/ghcn/daily/ghcnd-stations.txt')).split('\n')) {
  const id = line.slice(0, 11); if (!have.has(id)) continue;
  coords.push({ id, lat: Number(line.slice(12, 20)), lon: Number(line.slice(21, 30)), name: line.slice(41, 71).trim() });
}
console.log('normals stations', have.size, 'with coords', coords.length);

const num = v => { const n = Number(v); return Number.isFinite(n) && n > -7000 ? n : null; };
const cache = new Map();
async function normals(id) {
  if (cache.has(id)) return cache.get(id);
  const t = await text(NORMALS + id + '.csv');
  let out = null;
  if (t) {
    const [h, r] = t.split('\n'); const H = csvRow(h), R = csvRow(r || '');
    const g = k => num(R[H.indexOf(k)]);
    out = { hot90: g('ANN-TMAX-AVGNDS-GRTH090'), hot100: g('ANN-TMAX-AVGNDS-GRTH100'), frz: g('ANN-TMIN-AVGNDS-LSTH032'), snow: g('ANN-SNOW-NORMAL'),
      prcp: g('ANN-PRCP-NORMAL'), jjaMax: g('JJA-TMAX-NORMAL'), jjaMin: g('JJA-TMIN-NORMAL'), djfMax: g('DJF-TMAX-NORMAL'), djfMin: g('DJF-TMIN-NORMAL'), avg: g('ANN-TAVG-NORMAL') };
  }
  cache.set(id, out); return out;
}

const result = {};
for (const [slug, c] of Object.entries(cities)) {
  const [lat, lon] = maps[slug].dt;
  const near = coords.map(s => ({ ...s, d: km(lat, lon, s.lat, s.lon) })).filter(s => s.d <= 40).sort((a, b) => a.d - b.d);
  // prefer a first-order (USW) station within 25 km; otherwise the nearest complete one
  const ordered = [...near.filter(s => s.id.startsWith('USW') && s.d <= 25), ...near];
  let station = null, n = null;
  for (const s of ordered.slice(0, 8)) {
    const v = await normals(s.id);
    if (v && v.hot90 !== null && v.frz !== null && v.jjaMax !== null && v.djfMin !== null) { station = s; n = v; break; }
  }
  const q = new URLSearchParams({ f: 'json', geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', returnGeometry: 'false',
    outFields: ['COUNTY', 'STATEABBRV', 'STCOFIPS', 'RISK_RATNG', ...HAZ.map(h => `${h}_RISKR`)].join(',') });
  let nri = null;
  const nt = await text(`${NRI_COUNTY}?${q}`);
  try { const a = JSON.parse(nt).features?.[0]?.attributes; if (a) nri = { county: a.COUNTY, st: a.STATEABBRV, fips: a.STCOFIPS, risk: a.RISK_RATNG, ...Object.fromEntries(HAZ.map(h => [h.toLowerCase(), a[`${h}_RISKR`]])) }; } catch {}
  result[slug] = { station: station ? { id: station.id, name: station.name, km: Math.round(station.d * 10) / 10 } : null, ...(n || {}), nri };
  console.log(slug, station?.id || 'NO STATION', station ? station.d.toFixed(1) : '', n?.hot90, n?.hot100, n?.frz, n?.snow, nri?.hwav, nri?.wntw, nri?.hrcn);
  await sleep(120);
}
await mkdir('data/climate', { recursive: true });
await writeFile('data/climate/cities.json', JSON.stringify({ fetchedOn: new Date().toISOString().slice(0, 10), normals: '1991-2020', sources: { noaa: NORMALS, nri: NRI_COUNTY }, cities: result }));
console.log('missing station', Object.values(result).filter(r => !r.station).length, 'missing nri', Object.values(result).filter(r => !r.nri).length);
