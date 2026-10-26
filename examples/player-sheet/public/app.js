'use strict';
(()=>{
 const $=id=>document.getElementById(id),text=(id,v)=>{$(id).textContent=v;},value=v=>v===null||v===undefined?'—':String(v),signed=v=>typeof v==='number'&&Number.isFinite(v)?(v>=0?'+':'')+v:'—';
 const make=(tag,content,className)=>{const e=document.createElement(tag);if(content!==undefined)e.textContent=content;if(className)e.className=className;return e;};
 let authenticated=false,busy=false,timer,usersReady=false,hasSheet=false;
 const status=(message,error=false)=>{text('connection',message);$('connection').classList.toggle('error',error);};
 const controls=()=>{for(const id of ['refresh','logout','password'])$(id).disabled=busy;$('user').disabled=busy||!usersReady;$('submit').disabled=busy||!usersReady;};
 function clear(){hasSheet=false;$('sheet').hidden=true;$('empty').hidden=true;for(const id of ['actor-name','identity','hp-value','hp-max','hp-temp','ac','initiative','proficiency','speed','empty-message'])text(id,'');for(const id of ['abilities','skills','conditions'])$(id).replaceChildren();text('updated','Nessun dato caricato');}
 async function request(path,options={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{const r=await fetch('api/'+path,{credentials:'same-origin',cache:'no-store',...options,signal:controller.signal}),b=await r.json();if(!r.ok){const e=new Error(b.error??'Risposta non valida.');e.status=r.status;throw e;}return b;}
  catch(e){if(e.name==='AbortError')throw new Error('Il server non ha risposto in tempo. Riprova.');if(e instanceof TypeError)throw new Error('Connessione non disponibile. Riprova.');throw e;}finally{clearTimeout(timeout);}
 }
 async function loginView(message='Accedi con il tuo account Foundry.'){
  authenticated=false;clearTimeout(timer);clear();$('login').hidden=false;$('logout').hidden=true;$('password').value='';status(message);
  if(!usersReady)try{const b=await request('users');$('user').replaceChildren(make('option','Seleziona il tuo account'));$('user').firstChild.value='';for(const u of b.users){const e=make('option',u.name);e.value=u.id;$('user').append(e);}usersReady=b.users.length>0;if(!usersReady)status('Il Master deve prima creare un account Player in Foundry.',true);}catch(e){status(e.message,true);}
 }
 function render(b){
  authenticated=true;$('login').hidden=true;$('logout').hidden=false;
  if(!b.actor){clear();$('empty').hidden=false;text('empty-title',b.reason==='no-permission'?'Personaggio non accessibile':'Nessun personaggio assegnato');text('empty-message',b.reason==='no-permission'?'Il tuo account non ha proprietà Owner sul personaggio assegnato.':'La proprietà del PG e il campo Personaggio dell’account sono due impostazioni separate.');}
  else{const a=b.actor;$('empty').hidden=true;$('sheet').hidden=false;hasSheet=true;text('actor-name',a.name);text('identity','Livello '+value(a.level)+' · Account: '+b.user.name);for(const[id,v]of Object.entries({'hp-value':a.hp.value,'hp-max':a.hp.max,'hp-temp':a.hp.temp,ac:a.ac}))text(id,value(v));text('initiative',signed(a.initiative));text('proficiency',signed(a.proficiency));text('speed',a.speed.value===null?'—':value(a.speed.value)+(a.speed.units?' '+a.speed.units:''));
   $('conditions').replaceChildren(...(a.conditions.length?a.conditions:['Nessuna condizione attiva']).map(c=>make('li',c)));
   $('abilities').replaceChildren(...a.abilities.map(v=>{const row=make('div',undefined,'ability'),d=make('dd');row.append(make('dt',v.label));d.append(make('strong',signed(v.mod)),make('span','Punteggio '+value(v.value)),make('span','Salvezza '+signed(v.save)));row.append(d);return row;}));
   $('skills').replaceChildren(...a.skills.map(v=>{const row=make('li'),info=make('div');info.append(make('strong',v.label),make('small',[v.ability,'Passiva '+value(v.passive),v.proficiency>=2?'Maestria':v.proficiency===1?'Competenza':v.proficiency>0?'Mezza competenza':''].filter(Boolean).join(' · ')));row.append(info,make('span',signed(v.total),'bonus'));return row;}));
  }
  text('updated','Aggiornato alle '+new Date(b.updatedAt??Date.now()).toLocaleTimeString('it-IT'));status('Connesso a Foundry · Consultazione in sola lettura');
 }
 function schedule(){clearTimeout(timer);if(authenticated&&!document.hidden)timer=setTimeout(refresh,5000);}
 async function load(){try{render(await request('sheet'));}catch(e){if(e.status===401)await loginView('Accedi per consultare la scheda.');else status(e.message+(hasSheet?' I dati mostrati potrebbero essere obsoleti.':''),true);}}
 async function refresh(){if(busy)return;busy=true;clearTimeout(timer);controls();try{if(!authenticated&&!$('login').hidden)await loginView();else await load();}finally{busy=false;controls();schedule();}}
 $('login-form').addEventListener('submit',async e=>{e.preventDefault();if(busy||!$('login-form').reportValidity())return;busy=true;controls();status('Accesso in corso…');try{await request('login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:$('user').value,password:$('password').value})});$('password').value='';authenticated=true;$('login').hidden=true;$('logout').hidden=false;await load();}catch(e){status(e.message,true);$('password').value='';}finally{busy=false;controls();schedule();}});
 $('logout').addEventListener('click',async()=>{if(busy)return;busy=true;clearTimeout(timer);controls();authenticated=false;clear();try{await request('logout',{method:'POST'});await loginView('Sei uscito dal tuo account.');}catch(e){await loginView();$('logout').hidden=false;status('Uscita non confermata: '+e.message+' Premi Esci per riprovare.',true);}finally{busy=false;controls();schedule();}});
 $('refresh').addEventListener('click',refresh);document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden&&authenticated)refresh();});refresh();
})();
