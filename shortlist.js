/* Local-only saved candidates. Never fetch a listing link or send saved fields to analytics. */
(() => {
  const KEY='home-surroundings-shortlist-v1', LIMIT=3;
  const text=(v,n=250)=>typeof v==='string'?v.trim().slice(0,n):'';
  const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const point=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=18&&lat<=72&&lon>=-180&&lon<=-60;
  function link(value){const raw=text(value,2048);if(!raw)return '';const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Use a public http or https listing link.');return u.href;}
  const idFor=address=>text(address).toUpperCase().replace(/\s+/g,' ');
  function snapshot(report){
    const c=(report.crossings||[]).find(c=>c.isPublic!==false), r=report.roadSummary;
    return {railMeters:number(report.railMeters),road:r?{aadt:number(r.aadt),meters:number(r.meters),year:number(r.year),name:text(r.name)}:null,
      crossing:c?{distanceMiles:number(c.distanceMiles),nightTrains:number(c.nightTrains),dayTrains:number(c.dayTrains),year:number(c.trainCountYear),quietZone:text(c.quietZone?.label),street:text(c.street)}:null,
      noise:report.noise&&report.noise!=='error'?{label:text(report.noise.all?.label),year:number(report.noise.year)}:null,
      flood:report.flood&&report.flood!=='error'?{level:text(report.flood.level),label:text(report.flood.label),source:text(report.flood.source)}:null};
  }
  function clean(raw){
    if(!raw||typeof raw!=='object'||!text(raw.address)||!point(raw.lat,raw.lon))return null;
    let u='';try{u=link(raw.listingUrl)}catch{}
    const r=raw.report||{};
    return {id:idFor(raw.address),address:text(raw.address),lat:raw.lat,lon:raw.lon,listingUrl:u,
      savedAt:text(raw.savedAt,40),checkedAt:text(raw.checkedAt,40),report:snapshot({railMeters:r.railMeters,roadSummary:r.road,crossings:r.crossing?[{...r.crossing,trainCountYear:r.crossing.year,quietZone:{label:r.crossing.quietZone}}]:[],noise:r.noise?{all:{label:r.noise.label},year:r.noise.year}:null,flood:r.flood}),
      checks:raw.checks&&typeof raw.checks==='object'?Object.fromEntries(Object.entries(raw.checks).filter(([k,v])=>['pin','night','traffic','flood','visit'].includes(k)&&typeof v==='boolean')):{}};
  }
  function createStore(storage){
    let items=[],warning='';
    try{const raw=storage?.getItem(KEY);if(raw){if(raw.length>250000)throw Error('too large');const data=JSON.parse(raw);if(data.version!==1||!Array.isArray(data.items))throw Error('invalid');const seen=new Set();items=data.items.map(clean).filter(x=>x&&!seen.has(x.id)&&seen.add(x.id)).slice(0,LIMIT);}}
    catch{warning='Saved candidates could not be read. This session starts with an empty list.';}
    function persist(){try{if(!storage)throw Error('disabled');storage.setItem(KEY,JSON.stringify({version:1,items}));warning='';return true;}catch{warning='Browser storage is unavailable. These changes last only in this open page; they may be lost when you reload.';return false;}}
    return {list:()=>JSON.parse(JSON.stringify(items)),warning:()=>warning,
      save(report,meta={}){const address=text(report.matchedAddress),lat=number(report.lat),lon=number(report.lon);if(!address||!point(lat,lon))throw Error('Run an address check before saving this home.');const id=idFor(address),i=items.findIndex(x=>x.id===id);if(i<0&&items.length>=LIMIT)throw Error('Three homes are saved. Remove one to add another.');const old=items[i];const item={id,address,lat,lon,report:snapshot(report),listingUrl:link(meta.listingUrl),savedAt:old?.savedAt||new Date().toISOString(),checkedAt:text(report.requestedAt,40)||new Date().toISOString(),checks:old?.checks||{}};if(i<0)items.push(item);else items[i]=item;const persisted=persist();return {item,persisted};},
      edit(id,meta){const item=items.find(x=>x.id===id);if(!item)throw Error('This saved home is no longer available.');const u=link(meta.listingUrl);item.listingUrl=u;return persist();},
      sync(report){const item=items.find(x=>x.id===idFor(report.matchedAddress));if(!item)return false;item.report=snapshot(report);item.checkedAt=report.requestedAt||item.checkedAt;persist();return true;},
      check(id,key,done){const item=items.find(x=>x.id===id);if(item&&['pin','night','traffic','flood','visit'].includes(key)){item.checks[key]=!!done;persist();}},
      remove(id){items=items.filter(x=>x.id!==id);persist();},clear(){items=[];persist();}};
  }
  function tasks(item){const r=item.report||{},c=r.crossing;const list=[{id:'pin',text:'Confirm the map pin identifies the correct property.'}];
    if(c?.nightTrains>0)list.push({id:'night',text:`Visit after dark: the nearest public crossing reports ${c.nightTrains} night trains (${c.year||'year not reported'}). Counts apply to that crossing.`});
    else list.push({id:'visit',text:'Visit in the evening and during the commute. No reported night trains is not proof of quietness.'});
    if(r.road?.aadt>=15000)list.push({id:'traffic',text:`Observe traffic and sound at the home: a nearby counted road reports ${r.road.aadt.toLocaleString('en-US')} vehicles/day (${r.road.year||'year unknown'}).`});
    if(!r.flood||['high','moderate','unverified','unmapped','undetermined'].includes(r.flood.level))list.push({id:'flood',text:r.flood?.level==='high'?'Review the official FEMA map and ask about flood history and insurance.':'Verify the official FEMA flood map and its coverage. Unknown coverage does not establish low risk.'});
    return list.slice(0,4);
  }
  globalThis.HomeShortlist={KEY,LIMIT,createStore,snapshot,tasks,link};
  if(typeof document==='undefined')return;
  let storage;try{storage=localStorage}catch{}
  const store=createStore(storage),$=id=>document.getElementById(id),dialog=$('saveHomeDialog');let editing=null;
  const el=(tag,content,cls)=>{const n=document.createElement(tag);if(content!==undefined)n.textContent=content;if(cls)n.className=cls;return n;};
  const date=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Date unavailable';};
  function notice(message){$('shortlistStatus').textContent=message;$('shortlistStatus').classList.remove('hidden');}
  function close(){dialog.close?.();dialog.removeAttribute('open');editing=null;}
  function editor(report,item){editing={report,id:item?.id};$('saveHomeTitle').textContent=item?'Edit listing link':'Save this home';$('saveHomeAddress').textContent=item?.address||report.matchedAddress;$('homeListingUrl').value=item?.listingUrl||'';$('saveHomeError').textContent='';if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');$('homeListingUrl').focus();}
  $('cancelSaveHome').addEventListener('click',close);
  $('saveHomeForm').addEventListener('submit',event=>{event.preventDefault();if(!editing)return;try{const meta={listingUrl:$('homeListingUrl').value};const persisted=editing.report?store.save(editing.report,meta).persisted:store.edit(editing.id,meta);close();render();notice(persisted?'Saved on this browser. Your saved reports are snapshots; refresh them before a viewing.':store.warning());$('comparison').scrollIntoView({behavior:'smooth',block:'start'});}catch(error){$('saveHomeError').textContent=error.message;}});
  $('clearComparison').addEventListener('click',()=>{store.clear();render();notice(store.warning()||'All saved candidates removed from this browser.');});
  $('openShortlist').addEventListener('click',()=>$('comparison').scrollIntoView({behavior:'smooth',block:'start'}));
  function render(){
    const items=store.list();$('comparison').classList.toggle('hidden',!items.length&&!store.warning());$('openShortlist').classList.toggle('hidden',!items.length&&!store.warning());$('openShortlist').textContent=`Saved homes (${items.length})`;
    const cards=$('savedHomes');cards.replaceChildren();
    items.forEach(item=>{const card=el('article',undefined,'saved-home');card.append(el('h3',item.address));
      if(item.listingUrl){const a=el('a','Open original listing ↗');a.href=item.listingUrl;a.target='_blank';a.rel='noopener noreferrer';card.append(a);}
      const actions=el('div',undefined,'saved-actions');const edit=el('button','Edit link');edit.type='button';edit.setAttribute('aria-label','Edit '+item.address);edit.addEventListener('click',()=>editor(null,item));
      const refresh=el('button','Refresh report');refresh.type='button';refresh.setAttribute('aria-label','Refresh '+item.address);refresh.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('shortlist-refresh',{detail:item})));
      const remove=el('button','Remove');remove.type='button';remove.setAttribute('aria-label','Remove '+item.address);remove.addEventListener('click',()=>{store.remove(item.id);render();notice(store.warning()||'Candidate removed.');});actions.append(edit,refresh,remove);card.append(actions);
      card.append(el('p','Snapshot checked '+date(item.checkedAt)+'. Refresh to retrieve current source responses.','small-note'));
      const checks=el('fieldset',undefined,'visit-checklist');checks.append(el('legend','Before your viewing'));tasks(item).forEach(task=>{const label=el('label'),input=el('input');input.type='checkbox';input.checked=!!item.checks[task.id];input.addEventListener('change',()=>{store.check(item.id,task.id,input.checked);if(store.warning())notice(store.warning());});label.append(input,el('span',task.text));checks.append(label);});card.append(checks);cards.append(card);
    });
    const table=el('table'),head=el('thead'),hr=el('tr');const corner=el('th','Reported surroundings');corner.scope='col';hr.append(corner);items.forEach((item,i)=>{const th=el('th',`${String.fromCharCode(65+i)} · ${item.address}`);th.scope='col';hr.append(th);});head.append(hr);table.append(head);
    const body=el('tbody');
    const rows=[['Mapped rail line distance',x=>x.report.railMeters===null?'Not checked / unavailable':x.report.railMeters>5230.368?'None mapped within 3.25 mi':x.report.railMeters<0.3048?'<1 ft (approx.)':x.report.railMeters<160.9344?Math.round(x.report.railMeters/0.3048)+' ft (approx.)':(x.report.railMeters/1609.344).toFixed(2)+' mi'],['Nearest counted road',x=>x.report.road?.aadt===null||!x.report.road?'Not checked / unavailable':x.report.road.aadt.toLocaleString('en-US')+' vehicles/day · '+(x.report.road.year||'year unknown')],['Nearest public crossing · not tracks',x=>x.report.crossing?.distanceMiles===null||!x.report.crossing?'No public crossing returned':x.report.crossing.distanceMiles.toFixed(2)+' mi'],['Night trains at that crossing',x=>x.report.crossing?.nightTrains===null||!x.report.crossing?'Not reported':x.report.crossing.nightTrains+' · '+(x.report.crossing.year||'year unknown')],['Transportation noise · modeled average',x=>x.report.noise?.label?(x.report.noise.label+' · '+(x.report.noise.year||'year unknown')):'Not checked / unavailable'],['FEMA flood map',x=>x.report.flood?.level==='unverified'?'Coverage unverified':x.report.flood?.label||'Not checked / unavailable'],['Snapshot requested',x=>date(x.checkedAt)]];
    rows.forEach(([label,format])=>{const tr=el('tr'),th=el('th',label);th.scope='row';tr.append(th);items.forEach(item=>tr.append(el('td',format(item))));body.append(tr);});table.append(body);$('comparisonTable').replaceChildren(table);
    if(store.warning())notice(store.warning());
  }
  globalThis.ShortlistUI={save(report){const item=store.list().find(x=>x.id===idFor(report.matchedAddress));if(!item&&store.list().length>=LIMIT){notice('Three homes are saved. Remove one to add another.');$('comparison').scrollIntoView({behavior:'smooth'});return;}editor(report,item);},sync(report){if(store.sync(report))render();}};
  render();
})();
