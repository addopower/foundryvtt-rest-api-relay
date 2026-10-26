import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createApp,projectSheet} from '../server.mjs';
const uid='aaaaaaaaaaaaaaaa',aid='bbbbbbbbbbbbbbbb',origin='https://foundry.oliverpuz.zone';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
async function fixture(fn){
 let user={id:uid,name:'Player',role:1,character:{_id:aid}},owner=3,speed=30,initiative=7,world='mondo-test',offline=false,clock=0;
 const fetcher=async(url,o={})=>{
  url=new URL(url);if(offline)throw new Error('offline');
  if(url.pathname==='/join'){assert.equal(o.headers.Origin,'http://foundry');assert.equal(o.headers.Cookie,undefined);return JSON.parse(o.body).password==='right'?response({status:'success'}):response({},401);}
  assert.equal(o.method,undefined);
  if(url.pathname==='/api/status')return response({active:true,world});
  if(url.pathname==='/users')return response({data:[user,{id:'cccccccccccccccc',name:'GM',role:4}]});
  if(url.pathname==='/user')return response({data:{...user,id:url.searchParams.get('id')}});
  if(url.pathname==='/get')return response({data:{_id:aid,type:'character',name:'PG',ownership:{default:3,[uid]:owner}}});
  if(url.pathname==='/dnd5e/get-actor-details'){assert.equal(url.searchParams.get('actorUuid'),'Actor.'+aid);assert.equal(url.searchParams.get('userId'),uid);return response({data:{stats:{name:'PG',hp:{value:0,max:13,temp:4},ac:17,speed,speedUnits:'ft',initBonus:initiative,profBonus:2},abilities:{str:{value:17,mod:3,save:5}},skills:{ath:{total:5,passive:15,value:1}},conditions:[]}});}
  throw new Error('unexpected');
 };
 const server=http.createServer(createApp({relayUrl:'http://relay',foundryUrl:'http://foundry',clientId:'test',apiKey:'private',world:'mondo-test',origin},{fetcher,now:()=>clock}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let cookie='';
 const request=(p,m='GET',data)=>fetch(base+'/scheda/api/'+p,{method:m,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:data===undefined?undefined:JSON.stringify(data)});
 const login=async(password='right',id=uid)=>{const r=await request('login','POST',{userId:id,password});if(r.ok)cookie=r.headers.get('set-cookie').split(';')[0];return r;};
 try{await fn({request,login,base,setOwner:v=>owner=v,setUser:v=>user=v,setSpeed:v=>speed=v,setInit:v=>initiative=v,setOffline:v=>offline=v,setWorld:v=>world=v,expire:()=>clock=28800001});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
test('native login, assigned actor, canonical speed and final initiative',()=>fixture(async f=>{
 assert.equal((await f.request('sheet')).status,401);
 assert.equal((await(await f.request('users')).json()).users.length,1);
 assert.equal((await f.login('wrong')).status,401);
 const r=await f.login();assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 const a=(await(await f.request('sheet')).json()).actor;assert.equal(a.hp.value,0);assert.equal(a.speed.value,30);assert.equal(a.speed.units,'ft');assert.equal(a.initiative,7);assert.equal(a.abilities.length,6);assert.equal(a.skills.length,18);
 f.setSpeed(0);f.setInit(0);const zero=(await(await f.request('sheet')).json()).actor;assert.equal(zero.speed.value,0);assert.equal(zero.initiative,0);
 assert.equal((await f.request('logout','POST')).status,200);assert.equal((await f.request('sheet')).status,401);
}));
test('permissions, unassigned, ban, arbitrary actor and expiry',()=>fixture(async f=>{
 await f.login();assert.equal((await f.request('sheet?actorId=other')).status,400);f.setOwner(0);assert.equal((await(await f.request('sheet')).json()).reason,'no-permission');
 f.setUser({id:uid,name:'P',role:1,character:null});assert.equal((await(await f.request('sheet')).json()).reason,'no-character');
 f.setUser({id:uid,name:'P',role:0,character:null});assert.equal((await f.request('sheet')).status,401);
 f.setUser({id:uid,name:'P',role:1,character:null});await f.login();f.expire();assert.equal((await f.request('sheet')).status,401);
}));
test('outage and wrong world are explicit, foreign Origin is rejected',()=>fixture(async f=>{
 await f.login();f.setWorld('other');assert.equal((await f.request('sheet')).status,503);f.setOffline(true);assert.equal((await f.request('sheet')).status,503);
 assert.equal((await fetch(f.base+'/scheda/api/logout',{method:'POST',headers:{Origin:'https://other.invalid'}})).status,403);
}));
test('bad passwords do not block another account behind nginx',()=>fixture(async f=>{
 for(let i=0;i<10;i++)assert.equal((await f.login('wrong')).status,401);
 assert.equal((await f.login()).status,429);assert.equal((await f.login('right','dddddddddddddddd')).status,200);
}));
test('missing data stays unknown, never becomes a false zero',()=>{
 const p=projectSheet({id:uid,name:'P'},{_id:aid,name:'A'},{stats:{speed:'30',initBonus:null}});
 assert.equal(p.actor.speed.value,null);assert.equal(p.actor.initiative,null);assert.equal(p.actor.ac,null);assert.equal(p.actor.abilities.length,6);
});
