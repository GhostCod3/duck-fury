import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

type Actor = { x:number; y:number; vx:number; vy:number; alive:boolean; weapon:string|null; ammo:number; grounded:boolean; jumps:number };
type State = { mode:string; phase:string; time:number; round:number; scores:{player:number;enemy:number}; actors:Record<'player'|'enemy',Actor>; projectiles:object[]; pickups:object[]; particles:number; resources:object; views:Record<'player'|'enemy',{pose:object;complete:boolean}> };
const state = (page:Page):Promise<State> => page.evaluate(()=>(window as any).__duckArena.snapshot());
const setup = (page:Page,name='duel') => page.evaluate(name=>(window as any).__duckArena.setup(name),name);
async function ready(page:Page) { await page.goto('./'); await expect(page.locator('#arena-loading')).toBeHidden(); await page.waitForFunction(()=>!!(window as any).__duckArena?.snapshot().views); }
async function capture(page:Page,name:string) {
  mkdirSync('qa-captures',{recursive:true}); await page.locator('#arena-frame').screenshot({path:`qa-captures/${name}.png`});
  for(const [mime,extension] of [['image/png','png'],['image/jpeg','jpg']]) {
    const url=await page.locator('#arena-canvas canvas').evaluate((node,mime)=>(node as HTMLCanvasElement).toDataURL(mime,.88),mime);
    writeFileSync(`qa-captures/${name}-canvas.${extension}`,Buffer.from(url.split(',')[1],'base64'));
  }
}

test('arena loads original rigs and supports real weapon pickup and the ordinary bot',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);const initial=await state(page);expect(initial.phase).toBe('countdown');expect(initial.actors.player.weapon).toBeNull();
  await capture(page,'after-arena-ready');
  await page.locator('#arena-start').click();await page.waitForFunction(()=>(window as any).__duckArena.snapshot().phase==='playing');
  await page.keyboard.press('e');await page.waitForFunction(()=>(window as any).__duckArena.snapshot().actors.player.weapon==='pistol');
  await page.waitForFunction(()=>(window as any).__duckArena.snapshot().scores.enemy>0);
  expect((await state(page)).actors.player.alive).toBe(false);await capture(page,'after-arena-bot-hit');expect(errors).toEqual([]);
});
test('double jump, raised-platform landing, drop-through and keyboard movement',async({page})=>{
  await ready(page);await setup(page,'platform');
  const start=await state(page);expect(start.actors.player.y).toBe(477);
  await page.keyboard.press('Space');await page.waitForTimeout(130);const first=await state(page);expect(first.actors.player.y).toBeLessThan(477);
  await page.keyboard.press('Space');await page.waitForTimeout(100);expect((await state(page)).actors.player.jumps).toBe(2);
  await page.keyboard.press('Escape');await capture(page,'after-arena-double-jump');await page.keyboard.press('Escape');
  await page.waitForFunction(()=>(window as any).__duckArena.snapshot().actors.player.grounded);
  await page.keyboard.down('s');await page.waitForFunction(()=>(window as any).__duckArena.snapshot().actors.player.y>500);await page.keyboard.up('s');
  await page.waitForFunction(()=>(window as any).__duckArena.snapshot().actors.player.y===638);
  const x=(await state(page)).actors.player.x;await page.keyboard.down('d');await page.waitForTimeout(180);await page.keyboard.up('d');expect((await state(page)).actors.player.x).toBeGreaterThan(x+15);
});
test('a single shot scores once, renders a full KO and starts a fresh arena',async({page})=>{
  await ready(page);await setup(page);await page.keyboard.down('j');
  await page.waitForFunction(()=>(window as any).__duckArena.snapshot().phase==='roundOver');await page.keyboard.up('j');
  let s=await state(page);expect(s.scores).toEqual({player:1,enemy:0});expect(s.actors.enemy.alive).toBe(false);expect(s.actors.player.ammo).toBe(8);
  await page.keyboard.press('Escape');await capture(page,'after-arena-shot');await page.keyboard.press('Escape');
  await page.waitForFunction(()=>(window as any).__duckArena.snapshot().views.enemy.complete);
  await page.keyboard.press('Escape');s=await state(page);await capture(page,'after-arena-settled-ko');
  await page.waitForTimeout(150);expect((await state(page)).views.enemy).toEqual(s.views.enemy);await page.keyboard.press('Escape');
  await page.waitForFunction(()=>(window as any).__duckArena.snapshot().round===2);
  s=await state(page);expect(s.actors.enemy.alive).toBe(true);expect(s.actors.player.weapon).toBeNull();expect(s.scores.player).toBe(1);expect(s.pickups).toHaveLength(5);
});
test('first to five finishes the match and repeated replay cleans resources',async({page})=>{
  await ready(page);const resources=(await state(page)).resources;
  await setup(page,'lethal');await page.keyboard.press('j');await expect(page.locator('#arena-state-title')).toHaveText('TOP OF THE PECKING ORDER.');
  expect((await state(page)).mode).toBe('finished');expect((await state(page)).scores.player).toBe(5);
  await capture(page,'after-arena-match-won');const settled=await state(page);await page.waitForTimeout(250);
  expect((await state(page)).views.enemy).toEqual(settled.views.enemy);await page.locator('#arena-resume').click();
  expect((await state(page)).round).toBe(1);expect((await state(page)).scores).toEqual({player:0,enemy:0});
  for(let n=0;n<5;n++)await setup(page);
  const clean=await state(page);expect(clean.resources).toEqual(resources);expect(clean.particles).toBe(0);expect(clean.projectiles).toHaveLength(0);
});
test('pause, visibility and resume clear held inputs without catch-up',async({page})=>{
  await ready(page);await setup(page);await page.keyboard.down('d');await page.waitForTimeout(120);await page.keyboard.press('Escape');
  const paused=await state(page);await page.waitForTimeout(180);expect(await state(page)).toEqual(paused);
  await page.keyboard.up('d');await page.locator('#arena-resume').click();await page.waitForTimeout(230);const stopped=await state(page);await page.waitForTimeout(180);expect((await state(page)).actors.player.x).toBe(stopped.actors.player.x);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});expect((await state(page)).mode).toBe('paused');
  const hidden=await state(page);await page.waitForTimeout(150);expect((await state(page)).time).toBe(hidden.time);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.locator('#arena-resume').click();await page.waitForTimeout(80);expect((await state(page)).time-hidden.time).toBeLessThan(.2);
});
test('landscape touch supports movement, fire and jump together, then cancellation and rotation',async({browser})=>{
  const context=await browser.newContext({viewport:{width:915,height:412},hasTouch:true,isMobile:true});const page=await context.newPage();
  await ready(page);await setup(page);const before=await state(page);const pad=(await page.locator('#arena-pad').boundingBox())!,fire=(await page.getByRole('button',{name:'Fire weapon',exact:true}).boundingBox())!,jump=(await page.getByRole('button',{name:'Jump',exact:true}).boundingBox())!;
  const cdp=await context.newCDPSession(page),thumb={x:pad.x+pad.width*.85,y:pad.y+pad.height*.5,id:1},trigger={x:fire.x+fire.width/2,y:fire.y+fire.height/2,id:2},hop={x:jump.x+jump.width/2,y:jump.y+jump.height/2,id:3};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[thumb,trigger,hop]});await page.waitForTimeout(90);
  const active=await state(page);expect(active.actors.player.x).toBeGreaterThan(before.actors.player.x);expect(active.actors.player.y).toBeLessThan(before.actors.player.y);expect(active.actors.player.ammo).toBeLessThan(9);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.waitForTimeout(450);
  const released=await state(page);await page.waitForTimeout(120);expect((await state(page)).actors.player.x).toBe(released.actors.player.x);
  await page.keyboard.press('Escape');await capture(page,'after-arena-mobile-landscape');
  await page.setViewportSize({width:412,height:915});await expect(page.locator('.arena-rotate')).toBeVisible();expect((await state(page)).mode).toBe('paused');
  await page.setViewportSize({width:915,height:412});await expect(page.locator('.arena-rotate')).toBeHidden();await context.close();
});
test('production arena assets and classic entry load, and missing rig parts retain a playable fallback',async({page,browser})=>{
  const errors:string[]=[],assets=new Map<string,number>();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(/\/assets\/(rig|world)\//.test(r.url()))assets.set(r.url(),r.status());});
  await page.goto('http://127.0.0.1:4173/duck-fury/');await expect(page.locator('#arena-loading')).toBeHidden();expect(assets.size).toBe(13);expect([...assets.values()].every(s=>s===200)).toBe(true);expect(await page.evaluate(()=>(window as any).__duckArena)).toBeUndefined();
  await page.locator('#arena-start').click();await page.keyboard.press('Escape');await expect(page.locator('#arena-state-title')).toHaveText('PAUSED.');
  await page.goto('http://127.0.0.1:4173/duck-fury/classic.html');await expect(page.locator('#loading')).toBeHidden();
  const context=await browser.newContext();const fallback=await context.newPage();await fallback.route('**/assets/rig/head.webp',r=>r.abort());
  await ready(fallback);await fallback.locator('#arena-start').click();await fallback.waitForFunction(()=>(window as any).__duckArena.snapshot().phase==='playing');
  await fallback.keyboard.press('e');await fallback.waitForFunction(()=>(window as any).__duckArena.snapshot().actors.player.weapon==='pistol');expect(errors).toEqual([]);await context.close();
});

test('standard gamepad combines movement, Cross and Square; Circle, Options and disconnect reset correctly',async({page})=>{
  await page.addInitScript(()=>{
    (window as any).__pad={axes:[0,0],buttons:[],connected:true};
    Object.defineProperty(navigator,'getGamepads',{value:()=>{const p=(window as any).__pad;return p.connected?[{index:0,mapping:'standard',connected:true,axes:p.axes,buttons:Array.from({length:17},(_,i)=>({pressed:p.buttons.includes(i),value:Number(p.buttons.includes(i))}))}]:[];}});
  });
  const pad=async(buttons:number[]=[],axes=[0,0])=>{await page.evaluate(({buttons,axes})=>Object.assign((window as any).__pad,{buttons,axes}),{buttons,axes});await page.waitForTimeout(70);};
  await ready(page);await page.setViewportSize({width:915,height:412});await setup(page,'platform');await pad();const before=await state(page);
  await pad([0,2,15]);const active=await state(page);expect(active.actors.player.x).toBeGreaterThan(before.actors.player.x);expect(active.actors.player.y).toBeLessThan(before.actors.player.y);expect(active.actors.player.ammo).toBe(8);
  await expect(page.locator('#arena-input-hint')).toContainText('OPTIONS');
  await pad([0,15]);expect((await state(page)).actors.player.jumps).toBe(1);await pad();await pad([0]);expect((await state(page)).actors.player.jumps).toBe(2);
  await pad();await pad([9]);expect((await state(page)).mode).toBe('paused');await page.waitForTimeout(100);expect((await state(page)).mode).toBe('paused');
  await pad();await pad([9]);expect((await state(page)).mode).toBe('playing');await pad();
  await setup(page,'platform');await pad();await pad([],[-1,0]);expect((await state(page)).actors.player.x).toBeLessThan(280);await pad();
  await pad([2,15]);await page.evaluate(()=>{(window as any).__pad.connected=false;window.dispatchEvent(new Event('gamepaddisconnected'));});expect((await state(page)).mode).toBe('paused');
  await page.evaluate(()=>(window as any).__pad.connected=true);await page.locator('#arena-resume').click();await page.waitForTimeout(250);const reset=await state(page);await page.waitForTimeout(140);expect((await state(page)).actors.player.x).toBe(reset.actors.player.x);expect((await state(page)).actors.player.ammo).toBe(reset.actors.player.ammo);
  await pad();await setup(page);await pad();
  // Normal countdown spawn has a pistol within the equip radius.
  await page.locator('#arena-restart').evaluate((e:HTMLElement)=>e.click());await page.waitForFunction(()=>(window as any).__duckArena.snapshot().phase==='playing');await pad([1]);expect((await state(page)).actors.player.weapon).toBe('pistol');
  await pad();await pad([15]);await pad();await capture(page,'after-arena-gamepad-landscape');
});

test('ordinary landscape encounters play through all three layouts and expose readable pickup and empty ammo',async({browser})=>{
  const context=await browser.newContext({viewport:{width:915,height:412},hasTouch:true,isMobile:true,recordVideo:{dir:'qa-captures/normal-play'}});const page=await context.newPage();
  await ready(page);await page.locator('#arena-start').tap();
  for(let round=1;round<=3;round++){
    await page.waitForFunction(r=>{const s=(window as any).__duckArena.snapshot();return s.round===r&&s.phase==='playing';},round);
    await expect(page.locator('#arena-pickup-hint')).toContainText('9 SHOTS');
    if(round===1)await capture(page,'after-arena-pickup-landscape');
    await page.keyboard.press('e');await page.keyboard.down('j');await page.keyboard.press('Space');await page.waitForTimeout(120);
    expect((await state(page)).actors.player.weapon).toBe('pistol');await capture(page,`after-arena-normal-layout-${round}`);await page.keyboard.up('j');
    await page.waitForFunction(r=>{const s=(window as any).__duckArena.snapshot();return s.round>r||s.phase==='roundOver';},round);
  }
  await setup(page,'platform');await page.keyboard.down('j');await page.waitForFunction(()=>(window as any).__duckArena.snapshot().actors.player.ammo===0);await page.keyboard.up('j');
  await expect(page.locator('#arena-ammo')).toHaveText('EMPTY · SWAP GUN');await capture(page,'after-arena-empty-landscape');await context.close();
});
