import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const ROOT=new URL('./',import.meta.url), COOKIE='__Secure-fvtt-sheet', TTL=28800000;
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9]{16}$/.test(v);
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const isPlayer=u=>[1,2].includes(u?.role);
const abilities={str:'Forza',dex:'Destrezza',con:'Costituzione',int:'Intelligenza',wis:'Saggezza',cha:'Carisma'};
const skills={acr:'Acrobazia',ani:'Addestrare Animali',arc:'Arcano',ath:'Atletica',dec:'Inganno',his:'Storia',ins:'Intuizione',itm:'Intimidire',inv:'Indagare',med:'Medicina',nat:'Natura',prc:'Percezione',prf:'Intrattenere',per:'Persuasione',rel:'Religione',slt:'Rapidità di Mano',ste:'Furtività',sur:'Sopravvivenza'};
class AppError extends Error{constructor(status,message){super(message);this.status=status;}}
export function projectSheet(user,doc,data){
 const s=data.stats??{};
 return {user:{id:user.id,name:user.name},actor:{id:doc._id,name:s.name??doc.name,level:number(s.level),ac:number(s.ac),hp:{value:number(s.hp?.value),max:number(s.hp?.max),temp:number(s.hp?.temp)},speed:{value:number(s.speed),units:typeof s.speedUnits==='string'?s.speedUnits:''},initiative:number(s.initBonus),proficiency:number(s.profBonus),abilities:Object.entries(abilities).map(([key,label])=>({key,label,value:number(data.abilities?.[key]?.value),mod:number(data.abilities?.[key]?.mod),save:number(data.abilities?.[key]?.save)})),skills:Object.entries(skills).map(([key,label])=>({key,label,ability:abilities[data.skills?.[key]?.ability]??'',total:number(data.skills?.[key]?.total),passive:number(data.skills?.[key]?.passive),proficiency:number(data.skills?.[key]?.value)})),conditions:(data.conditions??[]).map(c=>String(c.name??c.id))},updatedAt:new Date().toISOString()};
}
export function createApp(config,{fetcher=fetch,now=Date.now}={}){
 const sessions=new Map(),failures=new Map(),origin=config.origin??'https://foundry.oliverpuz.zone',foundry=config.foundryUrl??'http://127.0.0.1:30000';
 const tokenOf=req=>req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 const cookie=(token,seconds=TTL/1000)=>COOKIE+'='+token+'; Path=/scheda/; HttpOnly; Secure; SameSite=Strict; Max-Age='+seconds;
 const send=(res,status,body,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(body));};
 async function relay(path,args={}){
  const url=new URL(path,config.relayUrl);
  for(const[k,v]of Object.entries({clientId:config.clientId,...args}))url.searchParams.set(k,String(v));
  const r=await fetcher(url,{headers:{'x-api-key':config.apiKey},signal:AbortSignal.timeout(8000),redirect:'error'}),b=await r.json();
  if(!r.ok||b.error)throw new AppError(503,'Foundry non è raggiungibile. Riprova tra poco.');
  return b.data??b.entity??b;
 }
 async function jsonBody(req){
  if(!req.headers['content-type']?.startsWith('application/json'))throw new AppError(415,'Formato della richiesta non supportato.');
  let text='';for await(const c of req){text+=c;if(Buffer.byteLength(text)>4096)throw new AppError(413,'Richiesta troppo grande.');}
  try{return JSON.parse(text);}catch{throw new AppError(400,'Richiesta non valida.');}
 }
 const assets={'/scheda/':['index.html','text/html; charset=utf-8'],'/scheda/app.js':['app.js','text/javascript; charset=utf-8'],'/scheda/style.css':['style.css','text/css; charset=utf-8']};
 const cleanup=setInterval(()=>{for(const[k,v]of sessions)if(v.expires<now())sessions.delete(k);for(const[k,v]of failures)if(now()-v.start>60000)failures.delete(k);},60000);cleanup.unref();
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try{
   const url=new URL(req.url,origin);
   if(req.method==='GET'&&assets[url.pathname]){const[name,type]=assets[url.pathname];res.writeHead(200,{'Content-Type':type});res.end(await readFile(new URL('public/'+name,ROOT)));return;}
   if(req.method==='GET'&&url.pathname==='/scheda/health'){send(res,200,{ok:true});return;}
   if(url.search)throw new AppError(400,'La scheda segue il personaggio assegnato al tuo account.');
   if(req.method==='POST'&&req.headers.origin!==origin)throw new AppError(403,'Apri la scheda dal suo indirizzo HTTPS.');
   if(req.method==='GET'&&url.pathname==='/scheda/api/users'){const u=await relay('/users');send(res,200,{users:u.filter(isPlayer).map(u=>({id:u.id,name:u.name}))});return;}
   if(req.method==='POST'&&url.pathname==='/scheda/api/login'){
    const b=await jsonBody(req);if(!validId(b?.userId)||typeof b.password!=='string'||b.password.length>512)throw new AppError(400,'Scegli un account e inserisci la sua password.');
    const key=b.userId,a=failures.get(key);if(a&&now()-a.start<60000&&a.count>=10)throw new AppError(429,'Troppi tentativi. Attendi un minuto e riprova.');
    const user=await relay('/user',{id:b.userId});if(!isPlayer(user))throw new AppError(401,'Usa un account Player di questo mondo.');
    // Isolated native validation: never forward or replace the desktop Foundry cookie.
    const r=await fetcher(foundry+'/join',{method:'POST',headers:{'Content-Type':'application/json',Origin:new URL(foundry).origin},body:JSON.stringify({action:'join',userId:b.userId,password:b.password}),signal:AbortSignal.timeout(8000),redirect:'error'});
    if(!r.ok){const old=failures.get(key),recent=old&&now()-old.start<60000;failures.set(key,{start:recent?old.start:now(),count:recent?old.count+1:1});throw new AppError(r.status===401?401:503,r.status===401?'Password non corretta.':'Il mondo Foundry non è disponibile.');}
    if((await r.json()).status!=='success')throw new AppError(401,'Accesso non riuscito.');
    failures.delete(key);sessions.delete(tokenOf(req));const token=randomBytes(32).toString('hex');sessions.set(token,{id:user.id,expires:now()+TTL,world:config.world});send(res,200,{ok:true},{'Set-Cookie':cookie(token)});return;
   }
   if(req.method==='POST'&&url.pathname==='/scheda/api/logout'){sessions.delete(tokenOf(req));send(res,200,{ok:true},{'Set-Cookie':cookie('',0)});return;}
   if(req.method==='GET'&&url.pathname==='/scheda/api/sheet'){
    const token=tokenOf(req),session=sessions.get(token);if(!session||session.expires<now()){sessions.delete(token);throw new AppError(401,'Accedi per vedere il tuo personaggio.');}
    const status=await fetcher(foundry+'/api/status',{signal:AbortSignal.timeout(5000)}).then(r=>r.json());if(!status.active||status.world!==session.world)throw new AppError(503,'Il mondo della tua scheda non è attivo.');
    const u=await relay('/user',{id:session.id});if(!isPlayer(u)){sessions.delete(token);throw new AppError(401,'Questo account non è più disponibile.');}
    const id=typeof u.character==='string'?u.character:u.character?.id??u.character?._id;
    const empty=reason=>({user:{id:u.id,name:u.name},actor:null,reason});if(!id){send(res,200,empty('no-character'));return;}
    if(!validId(id))throw new AppError(503,'Personaggio assegnato non valido.');
    const doc=await relay('/get',{uuid:'Actor.'+id});if(doc.type!=='character'||(doc.ownership?.[u.id]??doc.ownership?.default??0)<3){send(res,200,empty('no-permission'));return;}
    const data=await relay('/dnd5e/get-actor-details',{actorUuid:'Actor.'+id,userId:u.id,details:JSON.stringify(['stats','abilities','skills','conditions'])});send(res,200,projectSheet(u,doc,data));return;
   }
   throw new AppError(404,'Pagina non trovata.');
  }catch(e){send(res,e instanceof AppError?e.status:503,{error:e instanceof AppError?e.message:'Collegamento a Foundry interrotto. Riprova tra poco.'});}
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const config=JSON.parse(await readFile(process.env.CONFIG??new URL('access.json',ROOT),'utf8'));const s=http.createServer(createApp(config));s.requestTimeout=15000;s.listen(Number(process.env.PORT??43111),'127.0.0.1',()=>console.log('Scheda Player pronta su loopback'));}
