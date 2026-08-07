const FRA_ARCGIS = 'https://fragis.fra.dot.gov/arcgis/rest/services/FRA/FRAGradeX_iOS/MapServer/0/query';
const CURRENT_FORM71_API = 'https://data.transportation.gov/resource/xp92-5xme.json';
const INCIDENTS_API = 'https://data.transportation.gov/resource/uwah-u9bn.json';

export default async function handler(req, res) {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 18 || lat > 72 || lon < -180 || lon > -60) {
      return res.status(400).json({ error: 'Invalid U.S. coordinates.' });
    }

    // ~3.2 mile initial search box. We compute exact Haversine distance after retrieval.
    const latDelta = 0.05;
    const lonDelta = 0.05 / Math.max(Math.cos(lat * Math.PI / 180), 0.25);
    const envelope = `${lon-lonDelta},${lat-latDelta},${lon+lonDelta},${lat+latDelta}`;

    const params = new URLSearchParams({
      where: '1=1',
      geometry: envelope,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      returnGeometry: 'true',
      outSR: '4326',
      f: 'json'
    });

    const response = await fetch(`${FRA_ARCGIS}?${params}`, { headers: { 'User-Agent': 'RailroadHomeCheck/0.1' } });
    if (!response.ok) throw new Error(`FRA map service returned ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || 'FRA map service error');

    let crossings = (data.features || []).map((feature) => normalize(feature, lat, lon))
      .filter(c => Number.isFinite(c.distanceMiles) && c.distanceMiles <= 3.25)
      .sort((a,b) => a.distanceMiles - b.distanceMiles)
      .slice(0, 20);

    if (crossings.length) {
      const ids = crossings.map(c => c.crossingId).filter(Boolean);
      const [detailMap, incidentMap] = await Promise.all([getCurrentDetails(ids), getIncidents(ids)]);
      crossings = crossings.map(c => {
        const detail = detailMap.get(c.crossingId) || {};
        return {
          ...c,
          ...detail,
          // Preserve the spatially-derived fields even if a detail row is incomplete.
          distanceMiles: c.distanceMiles,
          lat: c.lat,
          lon: c.lon,
          street: detail.street || c.street,
          railroadCode: detail.railroadCode || c.railroadCode,
          quietZone: detail.quietZone?.code !== null && detail.quietZone?.code !== undefined ? detail.quietZone : c.quietZone,
          incidentCount: incidentMap.has(c.crossingId) ? incidentMap.get(c.crossingId) : 0
        };
      });
    }

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ crossings, source: 'Federal Railroad Administration Grade Crossing Inventory' });
  } catch (error) {
    console.error('crossings error', error);
    return res.status(502).json({ error: 'FRA crossing data is temporarily unavailable. Please try again shortly.' });
  }
}

function normalize(feature, propertyLat, propertyLon) {
  const a = feature.attributes || {};
  const geom = feature.geometry || {};
  const lat = number(first(a, ['LATDD','LATITUDE','Latitude','latitude'])) ?? number(geom.y);
  const lon = number(first(a, ['LONGDD','LONGITUD','LONGITUDE','Longitude','longitude'])) ?? number(geom.x);
  const quietRaw = value(first(a, ['WHISTBAN','WhistBan','Whistban','whistban']));
  const crossingClosed = value(first(a, ['CROSSINGCLOSED','CrossingClosed','crossingclosed']));

  return {
    crossingId: text(first(a, ['CROSSING','CROSSINGID','CrossingID','CrossingId','crossingid'])),
    street: text(first(a, ['STREET','Street','street','HIGHWAY','Highway','highway'])),
    city: text(first(a, ['CITYNAME','CityName','CITY','City','city'])),
    railroadCode: text(first(a, ['RAILROAD','Railroad','railroad','OPERATINGR','OperatingR'])),
    railroadName: text(first(a, ['RAILROADNAME','RailroadName','railroadname','OPERATIN_1'])),
    dayTrains: number(first(a, ['DAYTHRU','DayThru','daythru'])),
    nightTrains: number(first(a, ['NGHTTHRU','NghtThru','NightThru','nghtthru'])),
    weeklyTrains: number(first(a, ['WEEKTRNMOV','WeekTrnMov','weektrnmov'])),
    lessThanOne: ['1','YES','Y'].includes(value(first(a, ['LT1MOV','Lt1Mov','lt1mov'])).toUpperCase()),
    trainCountYear: number(first(a, ['YEARTRNMOV','YearTrnMov','yeartrnmov','TRNCOUNTYR','TRAINCOUNTYEAR'])),
    maxTimetableSpeed: number(first(a, ['MAXTTSPD','MaxTtSpd','maxttspd','MAXTTSPEED'])),
    typicalMinSpeed: number(first(a, ['MINSPD','MinSpd','minspd'])),
    typicalMaxSpeed: number(first(a, ['MAXSPD','MaxSpd','maxspd'])),
    quietZone: quietZone(quietRaw),
    crossingClosed: ['1','YES','Y'].includes(crossingClosed.toUpperCase()),
    lat,
    lon,
    distanceMiles: Number.isFinite(lat) && Number.isFinite(lon) ? haversine(propertyLat, propertyLon, lat, lon) : Infinity,
    incidentCount: null
  };
}

function quietZone(raw) {
  const code = String(raw ?? '').trim();
  if (code === '1' || /24\s*hr/i.test(code)) return { code: '1', label: '24-hour quiet zone', note: 'Routine horn sounding is restricted, subject to FRA rules.' };
  if (code === '2' || /partial/i.test(code)) return { code: '2', label: 'Partial quiet zone', note: 'Quiet-zone restrictions apply only during designated hours.' };
  if (code === '3' || /chicago/i.test(code)) return { code: '3', label: 'Chicago-excused', note: 'Special FRA quiet-zone treatment is reported.' };
  if (code === '0' || /^no$/i.test(code)) return { code: '0', label: 'No', note: 'No FRA quiet-zone designation is reported at this crossing.' };
  return { code: null, label: 'Not reported', note: 'Quiet-zone status was not available in the returned record.' };
}


async function getCurrentDetails(crossingIds) {
  const map = new Map();
  if (!crossingIds.length) return map;
  try {
    const unique = [...new Set(crossingIds)].slice(0, 20);
    const inClause = unique.map(id => `'${String(id).replaceAll("'", "''")}'`).join(',');
    const params = new URLSearchParams({
      '$select': 'crossingid,railroad,street,daythru,nghtthru,weektrnmov,lt1mov,yeartrnmov,maxttspd,minspd,maxspd,whistban',
      '$where': `crossingid in (${inClause})`,
      '$limit': '100'
    });
    const headers = { 'User-Agent': 'RailroadHomeCheck/0.1' };
    if (process.env.SOCRATA_APP_TOKEN) headers['X-App-Token'] = process.env.SOCRATA_APP_TOKEN;
    const r = await fetch(`${CURRENT_FORM71_API}?${params}`, { headers });
    if (!r.ok) return map;
    const rows = await r.json();
    for (const row of rows || []) {
      const id = text(row.crossingid);
      if (!id) continue;
      map.set(id, {
        crossingId: id,
        railroadCode: text(row.railroad),
        street: text(row.street),
        dayTrains: number(row.daythru),
        nightTrains: number(row.nghtthru),
        weeklyTrains: number(row.weektrnmov),
        lessThanOne: ['1','YES','Y'].includes(value(row.lt1mov).toUpperCase()),
        trainCountYear: number(row.yeartrnmov),
        maxTimetableSpeed: number(row.maxttspd),
        typicalMinSpeed: number(row.minspd),
        typicalMaxSpeed: number(row.maxspd),
        quietZone: quietZone(value(row.whistban))
      });
    }
  } catch (e) {
    console.warn('current Form 71 enrichment skipped', e);
  }
  return map;
}

async function getIncidents(crossingIds) {
  const map = new Map();
  if (!crossingIds.length) return map;
  try {
    const unique = [...new Set(crossingIds)].slice(0, 20);
    const inClause = unique.map(id => `'${String(id).replaceAll("'", "''")}'`).join(',');
    const params = new URLSearchParams({
      '$select': 'crossingid,count(*) as incident_count',
      '$where': `crossingid in (${inClause})`,
      '$group': 'crossingid',
      '$limit': '100'
    });
    const r = await fetch(`${INCIDENTS_API}?${params}`, { headers: { 'User-Agent': 'RailroadHomeCheck/0.1' } });
    if (!r.ok) return map;
    const rows = await r.json();
    for (const row of rows || []) map.set(String(row.crossingid), Number(row.incident_count || 0));
  } catch (e) {
    console.warn('incident lookup skipped', e);
  }
  return map;
}

function first(obj, keys) {
  for (const key of keys) if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  // Fallback: insensitive lookup because ArcGIS field casing can change.
  const lower = new Map(Object.keys(obj).map(k => [k.toLowerCase(), k]));
  for (const key of keys) {
    const actual = lower.get(key.toLowerCase());
    if (actual && obj[actual] !== undefined && obj[actual] !== null && obj[actual] !== '') return obj[actual];
  }
  return null;
}
function number(v) { if (v === undefined || v === null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function text(v) { return v === undefined || v === null || v === '' ? null : String(v).trim(); }
function value(v) { return v === undefined || v === null ? '' : String(v).trim(); }
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.7613;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
