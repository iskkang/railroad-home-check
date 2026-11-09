// discovery pass 2
const get = async (u) => { try { const r = await fetch(u, { signal: AbortSignal.timeout(30000) }); return [r.status, await r.text()]; } catch (e) { return ['ERR', String(e)]; } };
const [s1, t1] = await get('https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Census_Tracts/FeatureServer/0?f=json');
const j = JSON.parse(t1); console.log('PREFIXES', [...new Set(j.fields.map(f => f.name.split('_')[0]))].join(','));
const [s2, t2] = await get('https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Census_Tracts/FeatureServer/0/query?f=json&geometry=-112.07,33.45&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=TRACTFIPS,COUNTY,RISK_RATNG,HWAV_RISKR,HWAV_EALR,CWAV_RISKR,WNTW_RISKR,ISTM_RISKR,HRCN_RISKR,TRND_RISKR,CFLD_RISKR,IFLD_RISKR,RFLD_RISKR,WFIR_RISKR,HWAV_AFREQ,NRI_VER&returnGeometry=false');
console.log('TRACT', t2.slice(-900));
const [s3, t3] = await get('https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/access/USW00023183.csv');
console.log('NOAAHEAD', t3.slice(0, 200));
const lines = t3.split('\n'); const H = lines[0].split(','); const R = lines[1].split(',');
console.log('NOAAKEYS', H.length, H.map((k, i) => k.replace(/"/g, '') + '=' + (R[i] || '').replace(/"/g, '')).filter(x => /^(STATION|LATITUDE|LONGITUDE|NAME|ANN-TMAX-AVGNDS|ANN-TMIN-AVGNDS|ANN-SNOW-NORMAL|ANN-TAVG-NORMAL|ANN-PRCP-NORMAL|ANN-SNWD-AVGNDS)/.test(x)).join(' | '));
const [s4, t4] = await get('https://www.ncei.noaa.gov/pub/data/ghcn/daily/ghcnd-stations.txt');
console.log('GHCND', s4, t4.length, t4.slice(0, 200));
