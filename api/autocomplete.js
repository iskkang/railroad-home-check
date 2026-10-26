// Photon permits reasonable public-project use. Keep this endpoint debounced,
// bounded, transient, and replace with a dedicated provider at larger scale.
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
  let body=req.body||{};try{if(typeof body==='string')body=JSON.parse(body)}catch{return res.status(400).json({error:'Invalid JSON.'})}
  const q=typeof body.query==='string'?body.query.replace(/\+/g,' ').trim():'';
  if(q.length<5||q.length>250)return res.status(400).json({error:'Enter 5–250 characters.'});
  try {
    const params=new URLSearchParams({q,limit:'5',lang:'en',countrycode:'us'});
    const r=await fetch('https://photon.komoot.io/api/?'+params,{headers:{Accept:'application/json','User-Agent':'RailroadHomeCheck/1.0 (+https://railroad-home-check.vercel.app)'},signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw Error('Provider unavailable');const d=await r.json();
    if(!Array.isArray(d.features))throw Error('Invalid response');
    const items=d.features.map(f=>{const p=f.properties||{},point=f.geometry?.coordinates||[];
      const street=[p.housenumber,p.street].filter(Boolean).join(' ');
      const label=[p.name&&p.name!==p.street?p.name:null,street||p.street||p.name,p.city||p.town||p.village||p.county,p.state,p.postcode].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(', ');
      return{label,lat:point[1],lon:point[0],kind:p.type,preciseAddress:!!p.housenumber,country:p.countrycode};
    }).filter(i=>String(i.country).toUpperCase()==='US'&&i.label&&Number.isFinite(i.lat)&&Number.isFinite(i.lon)&&i.lat>=18&&i.lat<=72&&i.lon>=-180&&i.lon<=-60).slice(0,5);
    return res.status(200).json({items,source:'Photon / OpenStreetMap',note:'Approximate search candidates. Confirm the map position; street/place matches are not house locations.'});
  } catch{return res.status(502).json({error:'Address suggestions are unavailable. Submit a full address or choose a location on the map.'});}
}
