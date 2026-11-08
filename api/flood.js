// FEMA flood hazard zone at a point.
// Primary: FEMA National Flood Hazard Layer (NFHL) MapServer, layer 28 "Flood Hazard Zones".
// Backup: Esri Living Atlas "USA Flood Hazard Areas" (a reduced copy of NFHL: high- and moderate-risk areas only).
const NFHL = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query';
const LIVING_ATLAS = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0/query';
const FIELDS = 'FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,DFIRM_ID';

export default async function handler(req, res) {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 17 || lat > 72 || lon < -180 || lon > -60) {
    return res.status(400).json({ error: 'Invalid U.S. coordinates.' });
  }
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields: FIELDS, returnGeometry: 'false', f: 'json'
  });
  for (const [source, url, complete] of [['FEMA NFHL', NFHL, true], ['Esri Living Atlas (FEMA NFHL copy)', LIVING_ATLAS, false]]) {
    try {
      const response = await fetch(`${url}?${params}`, { headers: { 'User-Agent': 'RailroadHomeCheck/0.1' }, signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error(`${source} returned ${response.status}`);
      const data = await response.json();
      if (data.error || !Array.isArray(data.features)) throw new Error(`${source} error`);
      const zones = data.features.map(f => f.attributes || {});
      res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate=2592000');
      return res.status(200).json({ ...classify(zones, complete), source });
    } catch (error) {
      console.error('flood lookup', source, error?.message);
    }
  }
  return res.status(502).json({ error: 'FEMA flood data is temporarily unavailable.' });
}

// Highest-risk zone wins when the point touches more than one polygon.
function classify(zones, complete) {
  const pick = zones.find(z => z.SFHA_TF === 'T') || zones.find(z => /0\.2|LEVEE/i.test(z.ZONE_SUBTY || '')) || zones.find(z => z.FLD_ZONE === 'D') || zones[0];
  if (!pick) {
    // The full NFHL returning nothing means no digital FEMA map here; the reduced copy omits minimal-risk areas.
    return complete
      ? { level: 'unmapped', zone: null, label: 'No digital FEMA flood map here' }
      : { level: 'minimal', zone: null, label: 'Not in a mapped high- or moderate-risk zone' };
  }
  const zone = String(pick.FLD_ZONE || '').trim();
  const bfe = Number(pick.STATIC_BFE);
  const base = { zone, subtype: pick.ZONE_SUBTY || null, bfe: Number.isFinite(bfe) && bfe > -9000 ? bfe : null, panel: pick.DFIRM_ID || null };
  if (pick.SFHA_TF === 'T') return { ...base, level: 'high', label: `Zone ${zone}: high-risk flood area` };
  if (/0\.2|LEVEE/i.test(pick.ZONE_SUBTY || '')) return { ...base, level: 'moderate', label: `Zone ${zone}: moderate risk` };
  if (zone === 'D') return { ...base, level: 'undetermined', label: 'Zone D: flood risk undetermined' };
  return { ...base, level: 'minimal', label: `Zone ${zone}: minimal risk` };
}
