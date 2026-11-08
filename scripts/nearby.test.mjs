import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import handler from '../api/nearby.js';

const request=(layer='noise',lat='40.7128',lon='-74.006')=>({method:'GET',query:{layer,lat,lon}});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}});
const row={unique_key:'example',created_date:'2026-11-07',complaint_type:'Noise',descriptor:'Construction',status:'Open',latitude:'40.713',longitude:'-74.006'};
test('NYC source success preserves dates, radius, query filters and records',async()=>{
  const original=globalThis.fetch;let url;
  globalThis.fetch=async u=>{url=new URL(u);return Response.json([row]);};
  try{const res=response();await handler(request(),res);assert.equal(res.statusCode,200);assert.equal(res.data.items.length,1);assert.equal(res.data.radiusMeters,805);assert.match(url.searchParams.get('$where'),/within_circle\(location/);assert.match(url.searchParams.get('$where'),/starts_with\(complaint_type,'Noise'\)/);assert.equal(url.searchParams.get('$limit'),'200');assert.ok(res.data.windowStart);}
  finally{globalThis.fetch=original;}
});
test('transient source error retries once and recovers',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>++calls===1?new Response('',{status:503,headers:{'retry-after':'0'}}):Response.json([row]);
  try{const res=response();await handler(request(),res);assert.equal(res.statusCode,200);assert.equal(calls,2);}finally{globalThis.fetch=original;}
});
test('sustained rate limit is not cached or represented as zero results',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'30'}});};
  try{const res=response();await handler(request(),res);assert.equal(res.statusCode,503);assert.equal(calls,1);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.headers['Retry-After'],'30');assert.equal(res.data.items,undefined);assert.match(res.data.error,/busy/);}finally{globalThis.fetch=original;}
});
test('invalid source responses never become empty successful lists',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({error:'bad query'});
  try{const res=response();await handler(request(),res);assert.equal(res.statusCode,502);assert.equal(res.headers['Cache-Control'],'no-store');}finally{globalThis.fetch=original;}
});
test('outside NYC and invalid coordinates make no source requests',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Unexpected request');};
  try{const res=response();await handler(request('noise','33.75','-117.86'),res);assert.equal(res.data.supported,false);const invalid=response();await handler(request('noise','NaN'),invalid);assert.equal(invalid.statusCode,400);}finally{globalThis.fetch=original;}
});

// Exercise the actual UI lifecycle functions with a small DOM fixture. No network or address storage.
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const refresh=app.slice(app.indexOf('async function refreshNearbyLayer('),app.indexOf('function contextItems('));
const render=app.slice(app.indexOf('function renderContextResults('),app.indexOf('// Address candidates'));
class Element{
  constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.events={};this.classList={add:()=>{}};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(){}
  addEventListener(event,fn){this.events[event]=fn;}
}
function uiFixture(lat=40.7128,lon=-74.006){
  const container=new Element('section'),layers=[{id:'noise',source:'noise',label:'Noise complaints · NYC'},{id:'crime',source:'crime',label:'Reported incidents · NYC'}];
  const state={enabled:new Set(['noise','crime']),responses:{},requests:{},errors:{},groups:{},controller:new AbortController()};
  const report={lat,lon,nearbyContext:state},pending=[],context={currentReport:report,CONTEXT_LAYERS:layers,URLSearchParams,document:{createElement:tag=>new Element(tag),createTextNode:text=>text},$:()=>container,layerVisible:()=>true,contextItems:(r,l)=>r.nearbyContext.responses[l.source]?.items||[],drawContextLayer:()=>{},trackEvent:()=>{},fetchJSON:(url)=>new Promise((resolve,reject)=>pending.push({url,resolve,reject}))};
  vm.createContext(context);vm.runInContext(refresh+'\n'+render,context);
  const text=el=>typeof el==='string'?el:el.textContent+' '+el.children.map(text).join(' ');
  return{context,container,layers,state,report,pending,text:()=>text(container)};
}
test('failed layer remains visible when another layer completes, and retries independently',async()=>{
  const f=uiFixture();const first=f.context.refreshNearbyLayer(f.report,f.layers[0],null),second=f.context.refreshNearbyLayer(f.report,f.layers[1],null);
  f.pending[0].reject(Error('Source busy'));await first;
  f.pending[1].resolve({supported:true,items:[],note:'coverage'});await second;
  assert.match(f.text(),/Noise complaints · NYC · Unavailable/);assert.match(f.text(),/Source busy/);assert.match(f.text(),/Retry Noise/);assert.doesNotMatch(f.text(),/Noise complaints · NYC · 0/);
  const retry=f.context.refreshNearbyLayer(f.report,f.layers[0],null);assert.match(f.text(),/Noise complaints · NYC · Loading/);f.pending[2].resolve({supported:true,items:[],note:'coverage'});await retry;
  assert.match(f.text(),/Noise complaints · NYC · 0 returned/);assert.doesNotMatch(f.text(),/Unavailable/);assert.equal(f.state.responses.crime.supported,true);
});
test('shared source requests are coalesced and NYC gate avoids unnecessary calls',async()=>{
  const f=uiFixture(),a=f.context.refreshNearbyLayer(f.report,f.layers[0],null),b=f.context.refreshNearbyLayer(f.report,f.layers[0],null);
  assert.equal(f.pending.length,1);f.pending[0].resolve({supported:true,items:[]});await Promise.all([a,b]);
  const other=uiFixture(33.75,-117.86);await other.context.refreshNearbyLayer(other.report,other.layers[0],null);assert.equal(other.pending.length,0);assert.match(other.text(),/Not supported here/);
});
test('aborted old reports cannot redraw or acquire an error',async()=>{
  const f=uiFixture(),run=f.context.refreshNearbyLayer(f.report,f.layers[0],null);f.state.controller.abort();f.context.currentReport=null;const before=f.text();f.pending[0].reject(new DOMException('Aborted','AbortError'));await run;assert.equal(f.text(),before);assert.equal(f.state.errors.noise,undefined);
});
