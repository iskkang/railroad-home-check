// discovery pass
const get = async (u) => { try { const r = await fetch(u, { signal: AbortSignal.timeout(30000) }); const t = await r.text(); return [r.status, t]; } catch (e) { return ['ERR', String(e)]; } };
for (const u of [
  'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Census_Tracts/FeatureServer/0?f=json',
  'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0?f=json',
  'https://hazards.fema.gov/arcgis/rest/services/public/NRI/MapServer?f=json',
]) { const [s, t] = await get(u); console.log('URL', u, s, t.length); try { const j = JSON.parse(t); console.log('NAME', j.name || j.mapName, 'LAYERS', JSON.stringify((j.layers || []).map(l => l.id + ':' + l.name)).slice(0, 800)); console.log('FIELDS', (j.fields || []).map(f => f.name).filter(n => /HWAV|WNTW|CWAV|ISTM|HRCN|CFLD|RFLD|TRND|TRACT|STCOFIPS|COUNTY|STATE|RISK_R|NRI_ID/.test(n)).join(',').slice(0, 3000)); } catch { console.log('BODY', t.slice(0, 300)); } }
const [s2, t2] = await get('https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Census_Tracts/FeatureServer/0/query?f=json&geometry=-112.07,33.45&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false');
console.log('TRACTQ', s2, t2.slice(0, 2500));
for (const st of ['USW00023183', 'USW00094846', 'USW00012960']) { const [s, t] = await get(`https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/access/${st}.csv`); const [h, r] = t.split('\n'); console.log('NOAA', st, s); if (h) { const H = h.split('","').map(x => x.replace(/"/g, '')); const R = (r || '').split('","').map(x => x.replace(/"/g, '')); console.log(H.map((k, i) => k + '=' + R[i]).filter(x => /^(STATION|LATITUDE|LONGITUDE|NAME|ANN-TMAX-AVGNDS|ANN-TMIN-AVGNDS|ANN-SNOW-NORMAL|ANN-TAVG-NORMAL|ANN-PRCP-NORMAL|DJF-|JJA-TMAX-NORMAL)/.test(x)).join(' | ').slice(0, 3000)); } }
const [s3, t3] = await get('https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/access/');
console.log('NOAA-DIR', s3, t3.length, (t3.match(/\.csv/g) || []).length);
