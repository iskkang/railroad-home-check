// Street names for unnamed HPMS road segments, from Census TIGERweb (TIGER/Line roads).
// POST { pts: [[lat, lon, bearingDeg], ...] } (max 15) -> { names: [string|null, ...] }
// At intersections TIGERweb returns every nearby street, so the one whose direction matches the segment wins.
const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer/identify';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Use POST.' }); }
  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON.' }); } }
  const pts = Array.isArray(body.pts) ? body.pts.slice(0, 15) : [];
  const valid = p => Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(Number.isFinite) && p[0] > 17 && p[0] < 72 && p[1] > -180 && p[1] < -60;
  const names = new Array(pts.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < pts.length) {
      const i = next++;
      if (valid(pts[i])) names[i] = await nameAt(...pts[i]).catch(() => null);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  res.setHeader('Cache-Control', 's-maxage=2592000, stale-while-revalidate=2592000');
  return res.status(200).json({ names, source: 'U.S. Census Bureau TIGERweb' });
}

async function nameAt(lat, lon, bearing) {
  const d = 0.002;
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', sr: '4326', layers: 'all:2,6,8', tolerance: '25',
    mapExtent: `${lon - d},${lat - d},${lon + d},${lat + d}`, imageDisplay: '400,400,96',
    returnGeometry: 'true', maxAllowableOffset: '0.00002', f: 'json'
  });
  const response = await fetch(`${TIGER}?${params}`, { headers: { 'User-Agent': 'RailroadHomeCheck/0.1' }, signal: AbortSignal.timeout(7000) });
  if (!response.ok) return null;
  const data = await response.json();
  const k = Math.cos(lat * Math.PI / 180);
  const scored = (data.results || []).filter(r => r.attributes?.NAME && r.attributes.NAME !== 'Null').map(r => {
    // nearest piece of this street to the point, and how far its direction is from the segment's
    let best = Infinity, ang = null;
    for (const path of r.geometry?.paths || []) for (let i = 0; i + 1 < path.length; i++) {
      const [x1, y1] = path[i], [x2, y2] = path[i + 1];
      const dist = distToPiece((lon - x1) * k, lat - y1, (x2 - x1) * k, y2 - y1);
      if (dist < best) { best = dist; ang = Math.atan2(y2 - y1, (x2 - x1) * k) * 180 / Math.PI; }
    }
    const diff = Number.isFinite(bearing) && ang !== null ? Math.abs((((ang - bearing) % 180) + 270) % 180 - 90) : 0;
    return { name: r.attributes.NAME, dist: best, diff };
  });
  if (!scored.length) return null;
  scored.sort((a, b) => (a.diff > 35) - (b.diff > 35) || a.dist - b.dist || a.diff - b.diff);
  return scored[0].name;
}

function distToPiece(px, py, dx, dy) {
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, (px * dx + py * dy) / len)) : 0;
  return Math.hypot(px - t * dx, py - t * dy);
}
