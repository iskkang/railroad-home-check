import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import geocode from '../api/geocode.js';
import flood from '../api/flood.js';
import risk from '../api/risk.js';
import autocomplete from '../api/autocomplete.js';
import roadnames from '../api/roadnames.js';
import crossings from '../api/crossings.js';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(d){this.data=d;return this}});
async function mocked(fetcher,run){const old=globalThis.fetch;globalThis.fetch=fetcher;try{await run()}finally{globalThis.fetch=old}}
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
test('different streets and compass directions cannot silently generate a report',()=>{
 const src=app.slice(app.indexOf('function streetKey('),app.indexOf('async function fetchJSON('));const c={};vm.createContext(c);vm.runInContext(src,c);
 assert.equal(c.streetKey('1600 Pennsylvania Avenue NW, Washington DC'),c.streetKey('1600 PENNSYLVANIA AVE NW, WASHINGTON, DC'));
 assert.notEqual(c.streetKey('200 N Spring St, Los Angeles'),c.streetKey('200 S SPRING ST, LOS ANGELES'));
 assert.notEqual(c.streetKey('200 Santa Monica Pier, Santa Monica'),c.streetKey('200 SANTA MONICA BLVD, SANTA MONICA'));
 assert.match(app,/streetKey\(address\) !== streetKey[\s\S]*?openLocationPicker[\s\S]*?return;/);
});
test('dense road queries paginate and never present incomplete data as complete',async()=>{
 const source=app.slice(app.indexOf('async function fetchTrafficFeatures('),app.indexOf('function showRoadTraffic('));let calls=[];
 const c={URLSearchParams,AbortSignal,ROAD_TRAFFIC_SERVICE:'https://example.com',fetch:async url=>{const p=new URL(url).searchParams;calls.push(p.get('resultOffset'));return Response.json(calls.length===1?{features:[{id:1},{id:2}],exceededTransferLimit:true}:{features:[{id:3}]})}};vm.createContext(c);vm.runInContext(source,c);
 const d=await c.fetchTrafficFeatures(new URLSearchParams());assert.equal(d.features.length,3);assert.deepEqual(calls,['0','2']);
 c.fetch=async()=>Response.json({features:[{id:1}],exceededTransferLimit:true});await assert.rejects(()=>c.fetchTrafficFeatures(new URLSearchParams()),/bounded query limit/);
});
test('missing reduced flood polygons remain unverified',async()=>{
 let calls=0;await mocked(async()=>++calls===1?new Response('',{status:503}):Response.json({features:[]}),async()=>{const r=response();await flood({method:'GET',query:{lat:38.9,lon:-77}},r);assert.equal(r.data.level,'unverified');});
});
test('FEMA provider JSON errors never become successful empty risk results',async()=>{
 await mocked(async()=>Response.json({error:{code:500}}),async()=>{const r=response();await risk({method:'GET',query:{lat:38.9,lon:-77}},r);assert.equal(r.statusCode,502);});
});
test('non-object request bodies return 400 without provider requests',async()=>{
 await mocked(()=>{throw Error('Unexpected source call')},async()=>{for(const handler of [geocode,autocomplete,roadnames])for(const body of [null,[],123,'null','[]','123']){const r=response();await handler({method:'POST',body},r);assert.equal(r.statusCode,400)}});
});
test('Census no-match uses a house-level US fallback',async()=>{
 let calls=0;await mocked(async()=>++calls===1?Response.json({result:{addressMatches:[]}}):Response.json({features:[{properties:{countrycode:'US',housenumber:'350',street:'5th Avenue'},geometry:{coordinates:[-73.98,40.74]}}]}),async()=>{const r=response();await geocode({method:'POST',body:{address:'350 5th Avenue, New York, NY'}},r);assert.equal(r.statusCode,200);assert.equal(r.data.source,'photon');});
});
test('FRA transient failure retries without representing failure as zero crossings',async()=>{
 let calls=0;await mocked(async()=>{calls++;if(calls===1)throw Error('Temporary failure');return Response.json([])},async()=>{const r=response();await crossings({method:'GET',query:{lat:38.9,lon:-77}},r);assert.equal(r.statusCode,200);assert.equal(calls,2)});
});
