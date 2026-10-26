#!/usr/bin/env python3
"""Integration fixture for the existing local Foundry test harness; never use real PCs."""
import asyncio,copy,json,os,secrets,sys,time
from pathlib import Path
sys.path.insert(0,os.environ.get('FOUNDRY_TEST_HELPER','/srv/foundry-relay/written-in-blood/art-20261024'))
from integration import gm_browser,CHROME,private_json,semantic,call,query
from playwright.async_api import async_playwright,expect
BASE=os.environ.get('SHEET_URL','https://foundry.oliverpuz.zone/scheda/')
E=Path('/srv/foundry-relay/fork-20261026/evidence')/str(time.time_ns());E.mkdir()
checks={};created=[]
async def inventory(gm,uid):
 return await gm.evaluate('''id=>Object.fromEntries(['actors','scenes','journal','folders','users','messages'].map(k=>[k,game[k].filter(d=>d.uuid!=='User.'+id).map(d=>d.toObject()).sort((a,b)=>a._id.localeCompare(b._id))]))''',uid)
async def main():
 report={'url':BASE,'checks':checks,'physicalPhoneTested':False}
 try:
  async with gm_browser('fork bridge sheet') as(gm,gmId,_):
   before=await inventory(gm,gmId);private_json(E/'before.json',before)
   try:
    source=Path(os.environ.get('FOUNDRY_SYNTHETIC_ACTOR','/srv/foundry-relay/mobile-guide-20261025/builder/desktop-rest-receipt.json'))
    actor=copy.deepcopy(json.loads(source.read_text())['source'])
    for key in ['_id','_stats','folder','sort']:actor.pop(key,None)
    actor.update(name='Eroe collaudo bridge',ownership={'default':0},flags={'world':{'bridgeForkTest':True}})
    actor['system']['attributes']['hp'].update(value=0,temp=4)
    a=await asyncio.to_thread(call,query('/create'),'POST',{'entityType':'Actor','data':actor});aid=a['entity']['_id'];created.append('Actor.'+aid)
    password=secrets.token_urlsafe(24)
    u=await asyncio.to_thread(call,query('/create'),'POST',{'entityType':'User','data':{'name':'Player collaudo bridge','role':1,'password':password,'character':aid}});uid=u['entity']['_id'];created.append('User.'+uid)
    await gm.wait_for_function('({aid,uid})=>game.actors.has(aid)&&game.users.has(uid)',arg={'aid':aid,'uid':uid})
    await gm.evaluate('''async({aid,uid})=>game.actors.get(aid).update({ownership:{default:0,[uid]:3}})''',{'aid':aid,'uid':uid})
    async def native():
     return await gm.evaluate('''id=>{const a=game.actors.get(id),s=a.system;return {actor:a.name,hp:{value:s.attributes.hp.value,max:s.attributes.hp.max,temp:s.attributes.hp.temp},ac:s.attributes.ac.value,proficiency:s.attributes.prof,speed:s.attributes.movement.speeds.walk,units:s.attributes.movement.units,initiative:s.attributes.init.total,dex:s.abilities.dex.mod,abilities:Object.fromEntries(Object.entries(s.abilities).map(([k,v])=>[k,{value:v.value,mod:v.mod,save:typeof v.save==='object'?v.save.value:v.save}])),skills:Object.fromEntries(Object.entries(s.skills).map(([k,v])=>[k,{total:v.total,passive:v.passive,value:v.value}]))}}''',aid)
    async with async_playwright() as pw:
     b=await pw.chromium.launch(executable_path=CHROME,headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'])
     try:
      ctx=await b.new_context(viewport={'width':1440,'height':1000});page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
      await page.goto(BASE);await page.locator('#user').select_option(uid);await page.locator('#password').fill('wrong');await page.locator('#submit').click();await page.get_by_text('Password non corretta.',exact=True).wait_for();checks['wrong_password_rejected']=True
      await page.locator('#password').fill(password);await page.locator('#submit').click();await page.locator('#actor-name').filter(has_text=actor['name']).wait_for()
      cookie=next(c for c in await ctx.cookies() if c['name']=='__Secure-fvtt-sheet');assert cookie['secure'] and cookie['httpOnly'] and cookie['sameSite']=='Strict';checks['native_login_isolated_cookie']=True
      async def compare(label):
       original=await native();r=await ctx.request.get(BASE+'api/sheet');assert r.status==200;r=await r.json();a=r['actor']
       assert a['hp']==original['hp'] and a['ac']==original['ac'] and a['proficiency']==original['proficiency']
       assert a['speed']=={'value':original['speed'],'units':original['units']} and a['initiative']==original['initiative'],(a,original)
       for v in a['abilities']:assert all(v[k]==original['abilities'][v['key']][k] for k in ['value','mod','save'])
       for v in a['skills']:assert v['total']==original['skills'][v['key']]['total'] and v['passive']==original['skills'][v['key']]['passive'] and v['proficiency']==original['skills'][v['key']]['value']
       private_json(E/(label+'.json'),{'native':original,'sheet':r});return original
      await compare('ordinary');await expect(page.locator('#hp-value')).to_have_text('0');checks['all_native_stats_equal']=True
      for w,h in [(1440,1000),(390,844),(320,740)]:
       await page.set_viewport_size({'width':w,'height':h});assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth');await page.screenshot(path=str(E/('sheet-'+str(w)+'.png')),full_page=True)
      checks['desktop_mobile_no_overflow']=True
      await gm.evaluate('''async id=>game.actors.get(id).update({'system.attributes.movement.speeds.walk':'40','system.attributes.movement.bonus':'5','system.attributes.init.roll.bonus':'4'})''',aid)
      n=await compare('bonuses');assert n['initiative']>n['dex'] and n['speed']==45
      await page.locator('#refresh').click();await expect(page.locator('#speed')).to_have_text('45 ft');await expect(page.locator('#initiative')).to_have_text('+'+str(n['initiative']));checks['prepared_speed_and_initiative_bonuses']=True
      await gm.evaluate('''async id=>game.actors.get(id).toggleStatusEffect('grappled',{active:true})''',aid)
      n=await compare('grappled');assert n['speed']==0
      await page.locator('#refresh').click();await expect(page.locator('#speed')).to_have_text('0 ft');checks['condition_zero_speed']=True
      await gm.evaluate('''async id=>{const a=game.actors.get(id);await a.toggleStatusEffect('grappled',{active:false});await a.update({'system.attributes.movement.speeds.walk':'9','system.attributes.movement.bonus':'0','system.attributes.movement.units':'m','system.attributes.init.roll.bonus':'-2','system.attributes.hp.value':7});}''',aid)
      n=await compare('metric-zero-initiative');assert n['speed']==9 and n['initiative']==0
      await expect(page.locator('#hp-value')).to_have_text('7',timeout=12000);await expect(page.locator('#speed')).to_have_text('9 m');await expect(page.locator('#initiative')).to_have_text('+0');checks['metric_units_and_zero_initiative_poll']=True
      await page.reload();await page.locator('#actor-name').filter(has_text=actor['name']).wait_for();checks['reload_session']=True
      assert (await ctx.request.get(BASE+'api/sheet?actorId=ZZZZZZZZZZZZZZZZ')).status==400;checks['arbitrary_real_actor_rejected']=True
      await gm.evaluate('''async({aid,uid})=>game.actors.get(aid).update({['ownership.'+uid]:0})''',{'aid':aid,'uid':uid})
      await page.locator('#refresh').click();await page.get_by_role('heading',name='Personaggio non accessibile',exact=True).wait_for();assert await page.locator('#actor-name').inner_text()=='';checks['revoked_owner_clears_view']=True
      await gm.evaluate('''async({aid,uid})=>{await game.actors.get(aid).update({['ownership.'+uid]:3});await game.users.get(uid).update({character:null});}''',{'aid':aid,'uid':uid})
      await page.locator('#refresh').click();await page.get_by_role('heading',name='Nessun personaggio assegnato',exact=True).wait_for();checks['assignment_guidance']=True
      await gm.evaluate('async({aid,uid})=>game.users.get(uid).update({character:aid})',{'aid':aid,'uid':uid})
      await page.locator('#refresh').click();await page.locator('#actor-name').filter(has_text=actor['name']).wait_for()
      nativePage=await ctx.new_page();await nativePage.goto('https://foundry.oliverpuz.zone/join');await nativePage.select_option('select[name=userId]',uid);await nativePage.fill('input[name=password]',password);await nativePage.locator('#join-game-form button[type=submit]').click();await nativePage.wait_for_function('id=>globalThis.game?.ready&&game.user.id===id',arg=uid,timeout=45000)
      phoneCtx=await b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,user_agent='Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36')
      phone=await phoneCtx.new_page();phone.on('pageerror',lambda e:errors.append(str(e)));await phone.goto(BASE);await phone.locator('#user').select_option(uid);await phone.locator('#password').fill(password);await phone.locator('#submit').tap();await phone.locator('#actor-name').filter(has_text=actor['name']).wait_for();await expect(phone.locator('#speed')).to_have_text('9 m');await expect(phone.locator('#initiative')).to_have_text('+0');assert await phone.evaluate('typeof globalThis.game==="undefined"&&!document.querySelector("canvas")');assert await nativePage.evaluate('game.socket.connected&&game.user.active')
      await phone.screenshot(path=str(E/'phone-touch.png'),full_page=True);checks['phone_external_native_desktop_same_account']=True
      await phone.locator('#logout').tap();await phone.locator('#login').wait_for(state='visible');assert (await phoneCtx.request.get(BASE+'api/sheet')).status==401;checks['logout_revokes_session']=True
      await phoneCtx.close();assert not errors,errors;checks['no_page_errors']=True
     finally:await b.close()
   finally:
    for uuid in reversed(created):await asyncio.to_thread(call,query('/delete',uuid=uuid),'DELETE')
    await gm.wait_for_function('ids=>ids.every(u=>{const[k,id]=u.split(".");return !(k==="Actor"?game.actors:game.users).has(id)})',arg=created)
    after=await inventory(gm,gmId);private_json(E/'after.json',after);checks['all_preexisting_documents_unchanged']=before==after;assert before==after,'Preexisting changes detected'
  report['temporaryGmRemoved']=True
 except Exception as e:report['failure']=type(e).__name__+': '+str(e);raise
 finally:
  report['passed']=all(checks.values()) and 'failure' not in report;private_json(E/'result.json',report);print(json.dumps({'path':str(E),**report},ensure_ascii=False),flush=True)
asyncio.run(main())
