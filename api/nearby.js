const CITY_DATA='https://data.cityofnewyork.us/resource/';
const DDC='https://services.arcgis.com/v09SvJE7IY8GgvSx/arcgis/rest/services/DDC_Construction_Projects/FeatureServer';
const RADIUS=805; // Half-mile vicinity, fixed to keep public-source requests bounded.
async function json(url,options={}) {
  const r=await fetch(url,{...options,headers:{Accept:'application/json','User-Agent':'RailroadHomeCheck/1.0',...options.headers},signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw Error('Source HTTP '+r.status);
  const d=await r.json();if(d.error||d.remark)throw Error('Source incomplete');return d;
}
export default async function handler(req,res) {
  const lat=Number(req.query.lat),lon=Number(req.query.lon),layer=String(req.query.layer||'');
  if(req.method!=='GET')return res.status(405).json({error:'Use GET.'});
  if(req.query.lat==null||req.query.lon==null||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<18||lat>72||lon< -180||lon> -60||!['facilities','noise','construction','crime'].includes(layer))return res.status(400).json({error:'Invalid layer or U.S. coordinates.'});
  // A source vicinity gate, not a statement that the point lies inside NYC.
  if(layer!=='facilities'&&!(lat>=40.47&&lat<=40.94&&lon>=-74.26&&lon<=-73.69))return res.status(200).json({supported:false,items:[],note:'This layer currently uses New York City official records only. Other cities are not supported; no safety or quietness conclusion can be drawn.'});
  try {
    const result=layer==='facilities'?await facilities(lat,lon):layer==='construction'?await construction(lat,lon):await cityRecords(layer,lat,lon);
    res.setHeader('Cache-Control','s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({supported:true,layer,radiusMeters:RADIUS,fetchedAt:new Date().toISOString(),...result});
  }catch(e){console.warn('nearby layer unavailable',layer,e.message);return res.status(502).json({error:'This layer’s data source is unavailable. Try again; missing results do not mean the area is quiet or safe.'});}
}
async function facilities(lat,lon) {
  const dy=RADIUS/111320,dx=dy/Math.cos(lat*Math.PI/180);
  const bbox=[lon-dx,lat-dy,lon+dx,lat+dy].join(',');
  const d=await json('https://api.openstreetmap.org/api/0.6/map.json?bbox='+bbox);
  if(!Array.isArray(d.elements))throw Error('Invalid map response');
  const nodes=new Map(d.elements.filter(e=>e.type==='node').map(e=>[e.id,e]));
  const ways=new Map(d.elements.filter(e=>e.type==='way').map(e=>[e.id,e]));
  const points=e=>e.type==='node'?[e]:e.type==='way'?(e.nodes||[]).map(id=>nodes.get(id)).filter(Boolean):(e.members||[]).flatMap(m=>m.type==='way'?(ways.get(m.ref)?.nodes||[]).map(id=>nodes.get(id)).filter(Boolean):m.type==='node'&&nodes.has(m.ref)?[nodes.get(m.ref)]:[]);
  const items=[];
  for(const e of d.elements){
    const t=e.tags||{},a=t.amenity;let category,type;
    if(['bar','pub','nightclub','music_venue','theatre'].includes(a)){category='nightlife';type=a.replaceAll('_',' ');}
    else if(['fire_station','police','hospital'].includes(a)||t.emergency==='ambulance_station'||t.aeroway==='helipad'){category='emergency';type=(a||t.emergency||'helipad').replaceAll('_',' ');}
    else if(t.building==='warehouse'||t.man_made==='works'){category='industrial';type='Industrial / warehouse';}
    else continue;
    const pts=points(e);if(!pts.length)continue;
    const y=pts.reduce((n,p)=>n+p.lat,0)/pts.length,x=pts.reduce((n,p)=>n+p.lon,0)/pts.length;
    const meters=Math.hypot((y-lat)*111320,(x-lon)*111320*Math.cos(lat*Math.PI/180));if(meters>RADIUS)continue;
    items.push({id:e.type+'/'+e.id,name:t.name||type,type,category,lat:y,lon:x,hours:t.opening_hours||'Hours not listed',meters,sourceUrl:'https://www.openstreetmap.org/'+e.type+'/'+e.id});
  }
  items.sort((a,b)=>a.meters-b.meters);
  return{items:items.slice(0,300),truncated:items.length>300,source:'OpenStreetMap contributors',sourceUrl:'https://www.openstreetmap.org/copyright',note:'Mapped facilities, not verified noise sources. Coverage and opening hours may be incomplete or stale. Hospitals may not have an emergency department; warehouses may not be active. Point/area centers are approximate. No claim is made about siren frequency, operating hours, crime, or sound levels.'};
}
async function cityRecords(layer,lat,lon) {
  const noise=layer==='noise',dateField=noise?'created_date':'cmplnt_fr_dt',point=noise?'location':'geocoded_column',dataset=noise?'erm2-nwe9':'5uac-w243';
  const end=new Date(),start=new Date(end);start.setUTCDate(start.getUTCDate()-(noise?90:365));
  const where=`within_circle(${point},${lat},${lon},${RADIUS}) AND ${dateField} >= '${start.toISOString().slice(0,19)}' AND ${dateField} <= '${end.toISOString().slice(0,19)}'`+(noise?" AND starts_with(complaint_type,'Noise')":'');
  const params=new URLSearchParams({'$select':noise?'unique_key,created_date,complaint_type,descriptor,status,latitude,longitude':'cmplnt_num,cmplnt_fr_dt,ofns_desc,law_cat_cd,latitude,longitude','$where':where,'$order':dateField+' DESC','$limit':'200'});
  const rows=await json(CITY_DATA+dataset+'.json?'+params);if(!Array.isArray(rows))throw Error('Invalid city records');
  return{items:rows.map(r=>({id:String(noise?r.unique_key:r.cmplnt_num),name:noise?r.complaint_type:r.ofns_desc,type:noise?r.descriptor:r.law_cat_cd,date:r[dateField]?.slice(0,10),status:noise?r.status:'Reported incident; not a conviction',lat:Number(r.latitude),lon:Number(r.longitude)})).filter(validPoint),truncated:rows.length>=200,windowStart:start.toISOString().slice(0,10),windowEnd:end.toISOString().slice(0,10),source:noise?'NYC 311 service requests':'NYPD reported complaints (current-year dataset)',sourceUrl:'https://data.cityofnewyork.us/d/'+dataset,note:noise?'NYC source coverage only. Up to 200 recent complaints in the past 90 days, not unique noise events or measured decibels. Repeat reports and reporting differences affect counts. No reports does not establish quietness.':'NYC source coverage only. Up to 200 recent reported incidents in the requested past 365 days, limited to the published current-year dataset and completed reporting periods. Not a complete rolling-year total or safety rating. Records are allegations/reports, not convictions; locations are approximate and some incidents are missing or delayed.'};
}
async function construction(lat,lon) {
  const params=new URLSearchParams({f:'json',where:"UPPER(phase) = 'IN CONSTRUCTION'",geometry:lon+','+lat,geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',distance:String(RADIUS),units:'esriSRUnit_Meter',outFields:'ProjectID,Description,phase,ProjectedConstrCompl',returnGeometry:'true',outSR:'4326',resultRecordCount:'200'});
  const data=await Promise.all([0,1].map(i=>json(DDC+'/'+i+'/query?'+params)));
  if(data.some(d=>!Array.isArray(d.features)))throw Error('Invalid construction response');
  const items=data.flatMap((d,i)=>d.features.map(f=>{
    const a=f.attributes||{},paths=f.geometry?.paths||f.geometry?.rings||[],pt=nearestVertex(paths,lat,lon);
    return{id:i+'/'+a.ProjectID,name:a.Description||a.ProjectID,type:'DDC public project · '+a.phase,date:sourceDate(a.ProjectedConstrCompl),dateLabel:'Projected completion',lat:pt?.[1],lon:pt?.[0]};
  })).filter(validPoint);
  const unique=new Map();for(const item of items){const old=unique.get(item.id);const distance=p=>Math.hypot((p.lat-lat)*111320,(p.lon-lon)*111320*Math.cos(lat*Math.PI/180));if(!old||distance(item)<distance(old))unique.set(item.id,item);}
  return{items:[...unique.values()],truncated:data.some(d=>d.exceededTransferLimit),source:'NYC Department of Design and Construction',sourceUrl:DDC,note:'NYC DDC public construction-phase projects only, not all private construction, permits, or road works. Markers identify nearby vertices on project footprints, not exact work locations. Phase and projected completion do not verify that work/noise is occurring today.'};
}
function validPoint(x){return typeof x.lat==='number'&&typeof x.lon==='number'&&Number.isFinite(x.lat)&&Number.isFinite(x.lon)&&Math.abs(x.lat)<=90&&Math.abs(x.lon)<=180;}
function nearestVertex(paths,lat,lon){let best=null,min=Infinity;for(const path of paths)for(const p of path){const d=(p[0]-lon)**2*Math.cos(lat*Math.PI/180)**2+(p[1]-lat)**2;if(d<min){min=d;best=p}}return best;}

function sourceDate(v){if(!v)return null;const d=new Date(v);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):String(v);}
