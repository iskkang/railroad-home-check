// Modeled transportation noise at a point, from the USDOT/BTS National Transportation Noise Map (2020).
// GET /api/noise?lat=..&lon=..  ->  { region, year, metric, road, rail, aviation, all }
// Each layer is a legend band { band, lo, hi, label }; band 0 means nothing modeled at 45 dB or louder.
import { pointBands, BANDS } from '../lib/noise.js';

const out = i => (i === null || i === undefined ? null : { band: i, lo: BANDS[i].lo, hi: BANDS[i].hi, label: BANDS[i].label });

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Use GET.' }); }
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 17 || lat > 72 || lon < -180 || lon > -60) return res.status(400).json({ error: 'Invalid U.S. coordinates.' });
  try {
    const b = await pointBands(lat, lon);
    res.setHeader('Cache-Control', 's-maxage=2592000, stale-while-revalidate=2592000');
    if (!b) return res.status(200).json({ region: null });
    return res.status(200).json({ region: b.region, year: 2020, metric: '24-hour average sound level (LAeq), outdoors, modeled', road: out(b.road), rail: out(b.rail), aviation: out(b.aviation), all: out(b.all), source: 'USDOT/BTS National Transportation Noise Map' });
  } catch (error) {
    console.error('noise lookup', error?.message);
    return res.status(502).json({ error: 'The national noise map is temporarily unavailable.' });
  }
}
