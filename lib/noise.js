// USDOT / BTS National Transportation Noise Map, 2020 (24-hour LAeq, A-weighted, modeled).
// The services are cached tiles only (no identify), so we read the color of the tile pixel under a point
// and map it back to the published legend bands. Used by /api/noise and scripts/fetch-noise.mjs.
import { inflateSync } from 'node:zlib';

const BASE = 'https://geo.dot.gov/server/rest/services/Hosted/';
export const Z = 12; // deepest cached level (~30 m pixels at mid latitudes, close to the 30 m model grid)

// Legend bands of the published map, in order. Band 0 = nothing modeled at 45 dB or louder.
export const BANDS = [
  { lo: 0, hi: 45, label: 'Below 45 dB' },
  { lo: 45, hi: 50, label: '45–50 dB', rgb: [255, 193, 7] },
  { lo: 50, hi: 55, label: '50–55 dB', rgb: [255, 128, 0] },
  { lo: 55, hi: 60, label: '55–60 dB', rgb: [255, 0, 0] },
  { lo: 60, hi: 70, label: '60–70 dB', rgb: [255, 51, 153] },
  { lo: 70, hi: 80, label: '70–80 dB', rgb: [163, 0, 204] },
  { lo: 80, hi: 90, label: '80–90 dB', rgb: [82, 0, 204] },
  { lo: 90, hi: null, label: '90 dB or more', rgb: [0, 0, 255] }
];

// Region -> services. Hawaii has no rail layer.
export function servicesFor(lat, lon) {
  if (lat > 50 && lon < -129) return { region: 'Alaska', road: 'NTAD_Noise_2020_Alaska_Road', rail: 'NTAD_Noise_2020_Alaska_Rail', aviation: 'NTAD_Noise_2020_Alaska_Aviation', all: 'NTAD_Noise_2020_Alaska_Aviation_Road_Rail' };
  if (lat < 24 && lon < -150) return { region: 'Hawaii', road: 'NTAD_Noise_2020_Hawaii_Road', rail: null, aviation: 'NTAD_Noise_2020_Hawaii_Aviation', all: 'NTAD_Noise_2020_Hawaii_Aviation_Road' };
  if (lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66) return { region: 'CONUS', road: 'NTAD_Noise_2020_CONUS_Road', rail: 'NTAD_Noise_2020_CONUS_Rail', aviation: 'NTAD_Noise_2020_CONUS_Aviation', all: 'NTAD_Noise_2020_CONUS_Aviation_Road_Rail' };
  return null;
}

export function bandOf(r, g, b, a) {
  if (a < 128) return 0;
  let best = 0, bd = Infinity;
  for (let i = 1; i < BANDS.length; i++) {
    const [R, G, B] = BANDS[i].rgb, d = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return bd < 3 * 40 ** 2 ? best : 0; // far from every legend color (e.g. edge blending) -> treat as unbanded
}

// Web Mercator pixel coordinates at zoom z (256 px tiles).
export function worldPx(lon, lat, z = Z) {
  const n = 256 * 2 ** z, s = Math.sin(lat * Math.PI / 180);
  return { x: (lon + 180) / 360 * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}
export function pxToLonLat(x, y, z = Z) {
  const n = 256 * 2 ** z;
  return { lon: x / n * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI };
}

// Minimal PNG decoder: 8-bit gray/RGB/RGBA/gray+alpha and 1-8 bit palette (with tRNS). Non-interlaced only.
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let p = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0, pal = null, trns = null; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; interlace = d[12]; }
    else if (kind === 'PLTE') pal = d;
    else if (kind === 'tRNS') trns = d;
    else if (kind === 'IDAT') idat.push(d);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  if (interlace) throw new Error('interlaced PNG not supported');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!ch || (type !== 3 && depth !== 8)) throw new Error(`unsupported PNG type ${type}/${depth}`);
  const bpp = Math.max(1, (ch * depth) >> 3), stride = (w * ch * depth + 7) >> 3;
  const raw = inflateSync(Buffer.concat(idat)), px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, o = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i], a = i >= bpp ? px[o + i - bpp] : 0, b = y ? px[o - stride + i] : 0, c = y && i >= bpp ? px[o - stride + i - bpp] : 0;
      let v;
      if (f === 0) v = x; else if (f === 1) v = x + a; else if (f === 2) v = x + b; else if (f === 3) v = x + ((a + b) >> 1);
      else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      px[o + i] = v & 255;
    }
  }
  return {
    width: w, height: h,
    rgba(x, y) {
      const o = y * stride;
      if (type === 6) { const i = o + x * 4; return [px[i], px[i + 1], px[i + 2], px[i + 3]]; }
      if (type === 2) { const i = o + x * 3; return [px[i], px[i + 1], px[i + 2], 255]; }
      if (type === 0) { const v = px[o + x]; return [v, v, v, 255]; }
      if (type === 4) { const i = o + x * 2; return [px[i], px[i], px[i], px[i + 1]]; }
      const bit = x * depth, idx = (px[o + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
      return [pal[idx * 3], pal[idx * 3 + 1], pal[idx * 3 + 2], trns && idx < trns.length ? trns[idx] : 255];
    }
  };
}

// Fetches one tile; resolves to a decoded image or null for a tile the cache does not have (nothing modeled there).
export async function fetchTile(service, z, tx, ty, { timeout = 10000, tries = 2 } = {}) {
  const url = `${BASE}${service}/MapServer/tile/${z}/${ty}/${tx}`;
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'RailroadHomeCheck/0.1' }, signal: AbortSignal.timeout(timeout) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`tile ${r.status}`);
      return decodePng(Buffer.from(await r.arrayBuffer()));
    } catch (e) { last = e; }
  }
  throw last;
}

// Band index at one point for each layer: { road, rail, aviation, all } (rail null where not modeled).
export async function pointBands(lat, lon) {
  const s = servicesFor(lat, lon);
  if (!s) return null;
  const { x, y } = worldPx(lon, lat);
  const tx = Math.floor(x / 256), ty = Math.floor(y / 256), px = Math.floor(x) - tx * 256, py = Math.floor(y) - ty * 256;
  const keys = ['road', 'rail', 'aviation', 'all'];
  const vals = await Promise.all(keys.map(async k => {
    if (!s[k]) return null;
    const t = await fetchTile(s[k], Z, tx, ty);
    return t ? bandOf(...t.rgba(px, py)) : 0;
  }));
  const r = Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
  // The combined layer occasionally rounds below one of its own sources; the total can't be quieter than any source.
  r.all = Math.max(r.all ?? 0, r.road ?? 0, r.rail ?? 0, r.aviation ?? 0);
  return { region: s.region, ...r };
}
