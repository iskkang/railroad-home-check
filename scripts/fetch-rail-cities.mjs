// Discovery pass: print dataset fields so the full pipeline uses the right names.
const get = async (u) => { const r = await fetch(u); const t = await r.text(); return [r.status, t]; };
const [s1, t1] = await get("https://data.transportation.gov/resource/m2f8-22s6.json?$limit=1&$where=crossingtypecode='3' AND crossingpositioncode='1' AND crossingclosed='No' AND totalnighttimethrutrains>0");
console.log('FORM71', s1, t1.slice(0, 6000));
const [s2, t2] = await get('https://data.transportation.gov/resource/uwah-u9bn.json?$limit=1');
console.log('FORM57', s2, t2.slice(0, 5000));
const [s3, t3] = await get('https://api.census.gov/data/2023/acs/acs5?get=NAME,B01003_001E&for=place:*&in=state:17');
console.log('CENSUS', s3, t3.slice(0, 400));
const [s4, t4] = await get('https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_place_national.zip');
console.log('GAZ', s4, t4.length);
const [s5, t5] = await get("https://data.transportation.gov/resource/m2f8-22s6.json?$select=citycode,count(*) as n&$where=crossingtypecode='3' AND crossingpositioncode='1' AND crossingclosed='No'&$group=citycode&$having=count(*)>=15&$limit=50000");
console.log('GROUPS', s5, t5.length, t5.slice(0, 300));
