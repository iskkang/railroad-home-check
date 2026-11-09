// FEMA National Risk Index ratings for the census tract containing a point.
// GET /api/risk?lat=..&lon=..  ->  { tract, county, st, overall, hazards: { hwav: 'Relatively High', ... } }
const NRI_TRACTS = 'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Census_Tracts/FeatureServer/0/query';
const HAZ = ['HWAV', 'CWAV', 'WNTW', 'ISTM', 'HRCN', 'TRND', 'IFLD', 'CFLD', 'WFIR'];

export default async function handler(req, res) {
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 17 || lat > 72 || lon < -180 || lon > -60) return res.status(400).json({ error: 'Invalid U.S. coordinates.' });
  const params = new URLSearchParams({
    f: 'json', geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', returnGeometry: 'false',
    outFields: ['TRACTFIPS', 'COUNTY', 'STATEABBRV', 'RISK_RATNG', ...HAZ.map(h => `${h}_RISKR`)].join(',')
  });
  try {
    const r = await fetch(`${NRI_TRACTS}?${params}`, { headers: { 'User-Agent': 'RailroadHomeCheck/0.1' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`NRI ${r.status}`);
    const data = await r.json();
    const a = data.features?.[0]?.attributes;
    res.setHeader('Cache-Control', 's-maxage=2592000, stale-while-revalidate=2592000');
    if (!a) return res.status(200).json({ tract: null, hazards: {} });
    return res.status(200).json({ tract: a.TRACTFIPS, county: a.COUNTY, st: a.STATEABBRV, overall: a.RISK_RATNG, hazards: Object.fromEntries(HAZ.map(h => [h.toLowerCase(), a[`${h}_RISKR`] || null])), source: 'FEMA National Risk Index' });
  } catch (error) {
    console.error('risk lookup', error?.message);
    return res.status(502).json({ error: 'FEMA risk data is temporarily unavailable.' });
  }
}
