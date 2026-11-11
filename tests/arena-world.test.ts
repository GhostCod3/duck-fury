import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaWorld, ArenaStepper, NO_INPUT, WEAPONS, segmentRect, type ArenaInput, type ArenaEvent } from '../src/arena/ArenaWorld.ts';

const tick = 1 / 120;
function live() { const w = new ArenaWorld(); w.phase = 'playing'; return w; }
function advance(w: ArenaWorld, seconds: number, input: ArenaInput = NO_INPUT, bot: ArenaInput | undefined = NO_INPUT): ArenaEvent[] {
  const events: ArenaEvent[] = []; for (let n = 0; n < Math.round(seconds * 120); n++) events.push(...w.step(tick, input, bot)); return events;
}
test('rounds begin unarmed and the countdown accepts no combat or movement', () => {
  const w = new ArenaWorld(), before = structuredClone(w.actors);
  advance(w,1,{...NO_INPUT,move:1,jump:true,pickup:true,fire:true});
  assert.deepEqual(w.actors,before); assert.equal(w.phase,'countdown'); assert.equal(w.projectiles.length,0);
  advance(w,.5); assert.equal(w.phase,'playing'); assert.equal(w.actors.player.weapon,null);
});
test('a ground jump and one air jump work, a third is rejected, and landing restores both', () => {
  const w = live(), a = w.actors.player; a.x = 650;
  w.step(tick,{...NO_INPUT,jump:true},NO_INPUT); advance(w,.15);
  const height = a.y; assert.ok(height < 600); assert.equal(a.jumps,1);
  w.step(tick,{...NO_INPUT,jump:true},NO_INPUT); assert.equal(a.jumps,2); assert.ok(a.vy < -600);
  advance(w,.1); const velocity = a.vy;
  w.step(tick,{...NO_INPUT,jump:true},NO_INPUT); assert.equal(a.jumps,2); assert.ok(a.vy > velocity);
  advance(w,1.5); assert.equal(a.grounded,true); assert.equal(a.jumps,0);
});
test('one-way platforms permit ascent, catch descent and allow intentional drop-through', () => {
  const w = live(), a = w.actors.player; a.x = 280;
  w.step(tick,{...NO_INPUT,jump:true},NO_INPUT); advance(w,.2); w.step(tick,{...NO_INPUT,jump:true},NO_INPUT); advance(w,.8);
  assert.equal(a.y,477); assert.equal(a.grounded,true);
  advance(w,.5,{...NO_INPUT,drop:true}); assert.equal(a.y,638); assert.equal(a.grounded,true);
});
test('equip picks up nearby weapons, preserves remaining ammo in swaps and cannot duplicate them', () => {
  const w = live(), a = w.actors.player; a.x = 210;
  w.step(tick,{...NO_INPUT,pickup:true},NO_INPUT); assert.equal(a.weapon,'pistol'); assert.equal(a.ammo,9); assert.equal(w.pickups.length,4);
  a.ammo = 3; a.x = 290; a.y = 477;
  w.step(tick,{...NO_INPUT,pickup:true},NO_INPUT); assert.equal(a.weapon,'shotgun'); assert.equal(a.ammo,4);
  assert.ok(w.pickups.some(p=>p.kind==='pistol' && p.ammo===3)); assert.equal(w.pickups.length,4);
  w.step(tick,{...NO_INPUT,pickup:true},NO_INPUT); assert.equal(a.weapon,'shotgun');
});
test('fast swept projectiles kill once, award one point and preserve simultaneous draws', () => {
  const w = live(), p = w.actors.player, e = w.actors.enemy; p.x=480; e.x=760; p.weapon='pistol'; p.ammo=9;
  const events = advance(w,.5,{...NO_INPUT,fire:true});
  assert.equal(e.alive,false); assert.equal(p.ammo,8); assert.deepEqual(w.scores,{player:1,enemy:0});
  assert.equal(events.filter(e=>e.type==='death').length,1); assert.equal(events.filter(e=>e.type==='round').length,1);
  const draw = live(); draw.projectiles = [
    {id:1,owner:'player',kind:'pistol',x:1080,y:574,vx:4000,vy:0,life:1},
    {id:2,owner:'enemy',kind:'pistol',x:200,y:574,vx:-4000,vy:0,life:1},
  ]; draw.step(tick,NO_INPUT,NO_INPUT); assert.equal(draw.winner,null); assert.deepEqual(draw.scores,{player:0,enemy:0}); assert.equal(draw.phase,'roundOver');
});
test('weapon cadence and ammo are finite and firing unarmed cannot deal damage', () => {
  const w = live(); advance(w,1,{...NO_INPUT,fire:true}); assert.equal(w.projectiles.length,0); assert.equal(w.actors.enemy.alive,true);
  w.actors.player.weapon='shotgun'; w.actors.player.ammo=2; w.actors.enemy.y=328;
  const events=advance(w,3,{...NO_INPUT,fire:true}); assert.equal(w.actors.player.ammo,0); assert.equal(events.filter(e=>e.type==='shot').length,2);
});
test('raised platforms block bullets before a target and rockets can kill their owner', () => {
  const w = live(); w.actors.enemy.y=500; w.actors.enemy.x=640;
  w.projectiles=[{id:1,owner:'player',kind:'pistol',x:640,y:290,vx:0,vy:1500,life:1}];
  const events=advance(w,.2); assert.equal(w.actors.enemy.alive,true); assert.ok(events.some(e=>e.type==='impact')); assert.equal(w.projectiles.length,0);
  const rocket=live(); Object.assign(rocket.actors.player,{x:170,y:550,grounded:false});
  rocket.projectiles=[{id:1,owner:'player',kind:'rocket',x:170,y:470,vx:580,vy:1800,life:1}];
  const blast=advance(rocket,.1); assert.ok(blast.some(e=>e.type==='death' && e.actor==='player')); assert.equal(rocket.actors.player.alive,false);
});
test('bot seeks a gun, pursues and beats an idle player without fixtures', () => {
  const w = new ArenaWorld(); let hit=false;
  for(let n=0;n<120*12;n++) { const events=w.step(tick,NO_INPUT); hit ||= events.some(e=>e.type==='death' && e.actor==='player'); }
  assert.ok(hit); assert.ok(w.scores.enemy>0);
});
test('bot climbs to an armed opponent on an upper platform instead of firing into the floor', () => {
  const w=live(); Object.assign(w.actors.player,{x:640,y:328,grounded:true});
  Object.assign(w.actors.enemy,{weapon:'pistol',ammo:9}); let reached=false;
  for(let n=0;n<120*12 && w.phase==='playing';n++) { w.step(tick,NO_INPUT); reached ||= w.actors.enemy.y<380; }
  assert.ok(reached); assert.equal(w.actors.player.alive,false);
});
test('first to five ends the match, corpses land, and a new match fully resets the state', () => {
  const w=live(); w.scores.player=4; Object.assign(w.actors.player,{x:480,weapon:'pistol',ammo:9,vy:-100,grounded:false}); w.actors.enemy.x=760;
  advance(w,.3,{...NO_INPUT,fire:true}); assert.equal(w.scores.player,5);
  advance(w,3); assert.equal(w.phase,'matchOver'); assert.equal(w.actors.player.grounded,true);
  const frozen=JSON.stringify(w); advance(w,1,{...NO_INPUT,move:1,fire:true,jump:true}); assert.equal(JSON.stringify(w),frozen);
  const reset=new ArenaWorld(); assert.deepEqual(reset.scores,{player:0,enemy:0}); assert.equal(reset.round,1); assert.equal(reset.projectiles.length,0); assert.equal(reset.pickups.length,5);
});
test('next round resets actors, ammo and projectiles and cycles the arena', () => {
  const w=live(); Object.assign(w.actors.player,{x:480,weapon:'pistol',ammo:9}); w.actors.enemy.x=760;
  advance(w,.5,{...NO_INPUT,fire:true}); advance(w,2.1);
  assert.equal(w.round,2); assert.equal(w.map.name,'SPLIT LEVEL'); assert.deepEqual(w.scores,{player:1,enemy:0}); assert.ok(w.actors.enemy.alive); assert.equal(w.actors.player.weapon,null); assert.equal(w.projectiles.length,0);
});
test('a stalemate is a draw and frame stalls, queues and resource bounds stay finite', () => {
  const w=live(); w.remaining=.01; advance(w,.1); assert.equal(w.winner,null); assert.deepEqual(w.scores,{player:0,enemy:0});
  const stepper=new ArenaStepper(); let jumps=0, ticks=0;
  stepper.advance(.001,{...NO_INPUT,jump:true},()=>assert.fail());
  stepper.advance(10,NO_INPUT,(_dt,input)=>{jumps+=Number(input.jump);ticks++;}); assert.equal(jumps,1); assert.equal(ticks,30);
  stepper.advance(.001,{...NO_INPUT,pickup:true},()=>{}); stepper.reset();
  stepper.advance(.01,NO_INPUT,(_dt,input)=>assert.equal(input.pickup,false));
  const endless=live(); endless.actors.player.weapon='shotgun'; endless.actors.enemy.y=328;
  for(let n=0;n<120*40;n++){endless.actors.player.ammo=1000;endless.step(tick,{...NO_INPUT,fire:true},NO_INPUT);assert.ok(endless.projectiles.length<=96);assert.ok(endless.pickups.length<=20);}
});
test('15, 30 and 60 rendered FPS produce equal movement and retained jump edges', () => {
  const states=[];
  for(const hz of [15,30,60]){const w=live(),clock=new ArenaStepper();for(let f=0;f<hz;f++)clock.advance(1/hz,{...NO_INPUT,move:1,jump:f===0},(dt,input)=>w.step(dt,input,NO_INPUT));states.push(w.actors.player);}
  assert.deepEqual(states[0],states[1]); assert.deepEqual(states[1],states[2]);
});
test('segment collision handles parallel misses and bullets crossing a thin body', () => {
  assert.equal(segmentRect(0,5,100,0,{x:50,y:0,w:5,h:10}),.5);
  assert.equal(segmentRect(0,15,100,0,{x:50,y:0,w:5,h:10}),null);
  assert.equal(segmentRect(0,5,0,10,{x:50,y:0,w:5,h:10}),null);
  assert.equal(WEAPONS.pistol.pellets,1);
});

test('a quick fire tap survives a zero-tick frame and held fire continues across substeps',()=>{
  const clock=new ArenaStepper();let fired=0;
  clock.advance(.001,{...NO_INPUT,fire:true},()=>assert.fail());
  clock.advance(.099,NO_INPUT,(_dt,input)=>fired+=Number(input.fire));assert.equal(fired,1);
  fired=0;clock.advance(.1,{...NO_INPUT,fire:true},(_dt,input)=>fired+=Number(input.fire));assert.equal(fired,12);
  clock.advance(.001,{...NO_INPUT,fire:true},()=>{});clock.reset();
  clock.advance(.01,NO_INPUT,(_dt,input)=>assert.equal(input.fire,false));
});

test('bot reaction is configurable, delayed and deterministic, and a dodge cancels the shot',()=>{
  const make=(delay:number)=>{const w=new ArenaWorld({reactionDelay:delay});w.phase='playing';Object.assign(w.actors.enemy,{x:760,weapon:'pistol',ammo:9});w.actors.player.x=480;return w;};
  const slow=make(.4), fast=make(.1);let slowShot=0,fastShot=0;
  for(let n=0;n<120;n++){if(slow.step(tick,NO_INPUT).some(e=>e.type==='shot')&&!slowShot)slowShot=n+1;if(fast.step(tick,NO_INPUT).some(e=>e.type==='shot')&&!fastShot)fastShot=n+1;}
  assert.ok(slowShot>=90);assert.ok(fastShot>0&&fastShot<slowShot);
  const dodge=make(.3);for(let n=0;n<60;n++)dodge.step(tick,NO_INPUT);Object.assign(dodge.actors.player,{y:328,vy:0});
  assert.equal(dodge.step(tick,NO_INPUT).some(e=>e.type==='shot'),false);
  const a=make(.24),b=make(.24);for(let n=0;n<700;n++){const input={...NO_INPUT,move:Math.sin(n/90),jump:n%83===0};assert.deepEqual(a.step(tick,input),b.step(tick,input));}assert.deepEqual(a.actors,b.actors);
});
test('bot navigates every layout to the upper player with bounded jumps and finite ammunition',()=>{
  for(let layout=0;layout<3;layout++){
    const w=new ArenaWorld();w.round=layout+1;w.phase='playing';const top=w.map.platforms.reduce((a,b)=>a.y<b.y?a:b);
    Object.assign(w.actors.player,{x:top.x+top.w/2,y:top.y,grounded:true});Object.assign(w.actors.enemy,{weapon:'pistol',ammo:9});
    let reached=false,jumps=0,shots=0;for(let n=0;n<120*18&&w.phase==='playing';n++){const before=w.actors.enemy.jumps;const events=w.step(tick,NO_INPUT);jumps+=Number(w.actors.enemy.jumps>before);shots+=events.filter(e=>e.type==='shot'&&e.actor==='enemy').length;reached ||= w.actors.enemy.y<=top.y+10;}
    assert.ok(reached,`layout ${layout} should be reachable`);assert.ok(jumps<25);assert.ok(shots<=9);assert.equal(w.actors.player.alive,false);
  }
});
test('bot ignores empty pickups, does not endlessly swap a loaded weapon or fire through a platform',()=>{
 const w=live();w.pickups=[{id:99,x:1110,y:638,kind:'rocket',ammo:0,availableAt:0}];advance(w,1,NO_INPUT,undefined);assert.equal(w.actors.enemy.weapon,null);
 const armed=live();Object.assign(armed.actors.enemy,{x:640,y:638,weapon:'pistol',ammo:9});Object.assign(armed.actors.player,{x:640,y:328});
 armed.pickups=[{id:99,x:640,y:638,kind:'shotgun',ammo:4,availableAt:0}];
 for(let n=0;n<20;n++)armed.step(tick,NO_INPUT);assert.equal(armed.actors.enemy.ammo,9);assert.equal(armed.actors.enemy.weapon,'pistol');assert.equal(armed.pickups.length,1);
});

test('an unreachable high target does not cause endless jump attempts',()=>{
  const w=live();Object.assign(w.actors.enemy,{weapon:'pistol',ammo:9});let jumps=0;
  for(let n=0;n<120*15;n++){
    Object.assign(w.actors.player,{x:640,y:-400,vy:0,grounded:false});const before=w.actors.enemy.jumps;w.step(tick,NO_INPUT);jumps+=Number(w.actors.enemy.jumps>before);
  }
  assert.ok(jumps<12,`bounded route attempts, got ${jumps}`);assert.equal(w.actors.enemy.ammo,9);
});
