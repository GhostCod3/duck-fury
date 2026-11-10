import Phaser from 'phaser';
import { preloadRigAssets, getRigAssets, PANORAMA_KEY } from '../art/rig/rigAssets';
import { Sound } from '../game/Sound';
import { ArenaWorld, ArenaStepper, NO_INPUT, WEAPONS, type ArenaEvent, type ActorId, type ArenaInput } from './ArenaWorld';
import { ArenaControls } from './ArenaControls';
import { ArenaDuckView, drawWeapon } from './ArenaDuckView';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const text = (id: string, value: string) => { const e = el(id); if (e.textContent !== value) e.textContent = value; };
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: number; size: number; gravity: boolean }
export class ShooterScene extends Phaser.Scene {
  world = new ArenaWorld();
  mode: 'ready' | 'playing' | 'paused' | 'finished' = 'ready';
  private controls!: ArenaControls;
  private clock = new ArenaStepper();
  private skipElapsed = true;
  private effects = new Sound();
  private actors!: Record<ActorId, ArenaDuckView>;
  private stage!: Phaser.GameObjects.Graphics;
  private items!: Phaser.GameObjects.Graphics;
  private particles: Particle[] = [];
  private fx!: Phaser.GameObjects.Graphics;
  private labels!: Record<ActorId, Phaser.GameObjects.Text>;
  private banner!: Phaser.GameObjects.Text;
  private subBanner!: Phaser.GameObjects.Text;
  private botEnabled = true;
  private abort = new AbortController();
  constructor() { super('shooter'); }
  preload(): void { preloadRigAssets(this); }
  create(): void {
    if (this.textures.exists(PANORAMA_KEY)) this.add.image(640, 360, PANORAMA_KEY).setDisplaySize(2160, 720).setTint(0x928c88).setAlpha(.65);
    else this.add.rectangle(640,360,1280,720,0x202d32);
    this.add.rectangle(640,360,1280,720,0x111a20,.35);
    this.stage = this.add.graphics().setDepth(3);
    this.actors = { player: new ArenaDuckView(this, false, getRigAssets(this)), enemy: new ArenaDuckView(this, true, getRigAssets(this)) };
    this.items = this.add.graphics().setDepth(25); this.fx = this.add.graphics().setDepth(30);
    const style = { fontFamily: 'Arial, sans-serif', fontSize: '11px', fontStyle: 'bold', stroke: '#101b20', strokeThickness: 4 };
    this.labels = { player: this.add.text(0,0,'▼ YOU', { ...style, color:'#ffe0a4' }).setOrigin(.5).setDepth(35), enemy: this.add.text(0,0,'BOT ▼', { ...style, color:'#84ede2' }).setOrigin(.5).setDepth(35) };
    this.banner = this.add.text(640,225,'', { fontFamily:'Impact, Arial Black, sans-serif', fontSize:'60px', fontStyle:'italic', color:'#ffcf70', stroke:'#111a20', strokeThickness:8 }).setOrigin(.5).setDepth(40);
    this.subBanner = this.add.text(640,276,'', { fontFamily:'monospace',fontSize:'13px',color:'#e5e4d8',stroke:'#111a20',strokeThickness:4 }).setOrigin(.5).setDepth(40);
    this.controls = new ArenaControls(() => this.togglePause(), () => this.start());
    const signal = this.abort.signal;
    el('arena-start').addEventListener('click', () => this.start(), { signal });
    el('arena-pause').addEventListener('click', () => this.togglePause(), { signal });
    el('arena-resume').addEventListener('click', () => this.start(), { signal });
    el('arena-restart').addEventListener('click', () => this.newMatch(), { signal });
    el('arena-sound').addEventListener('click', () => {
      this.effects.unlock(); this.effects.enabled = !this.effects.enabled;
      el('arena-sound').setAttribute('aria-label', this.effects.enabled ? 'Mute sound' : 'Enable sound'); text('arena-sound', this.effects.enabled ? '♪' : '♩');
    }, { signal });
    el('arena-fullscreen').addEventListener('click', async () => {
      try { if (document.fullscreenElement) await document.exitFullscreen(); else await el('arena-frame').requestFullscreen(); }
      catch { el('arena-fullscreen').title = 'Fullscreen unavailable'; }
    }, { signal });
    document.addEventListener('fullscreenchange', () => el('arena-fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'), { signal });
    const help = el<HTMLDialogElement>('arena-help');
    el('arena-help-button').addEventListener('click', () => { this.pause(); help.showModal(); }, { signal });
    el('arena-help-close').addEventListener('click', () => help.close(), { signal });
    el('arena-help-done').addEventListener('click', () => help.close(), { signal });
    window.addEventListener('blur', () => { this.controls.clear(); this.pause(); }, { signal });
    document.addEventListener('visibilitychange', () => { this.resetClock(); if (document.hidden) this.pause(); }, { signal });
    window.addEventListener('resize', () => { if (innerWidth < 700 && innerHeight > innerWidth) this.pause(); }, { signal });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.abort.abort(); this.controls.destroy(); });
    this.rebuildStage(); this.resetViews(); this.paint(0); this.refreshHud(); el('arena-loading').hidden = true;
  }
  start(): void {
    this.effects.unlock();
    if (this.mode === 'finished') { this.newMatch(); return; }
    if (this.mode === 'playing') return;
    this.mode = 'playing'; this.resetClock(); el('arena-start-overlay').hidden = el('arena-state-overlay').hidden = true;
    el('arena-frame').classList.remove('is-ready'); text('arena-pause','Ⅱ'); el('arena-pause').setAttribute('aria-label','Pause game');
  }
  pause(): void {
    if (this.mode !== 'playing') return;
    this.mode = 'paused'; this.resetClock(); this.cameras.main.shakeEffect.reset();
    this.showOverlay('TAKE A BREATHER', 'PAUSED.', 'Even a bad duck deserves a break.', 'RESUME MATCH');
    text('arena-pause','▶'); el('arena-pause').setAttribute('aria-label','Resume game');
  }
  togglePause(): void { if (this.mode === 'paused') this.start(); else this.pause(); }
  newMatch(): void {
    this.world = new ArenaWorld(); this.botEnabled = true; this.particles = []; this.mode = 'ready';
    this.rebuildStage(); this.resetViews(); this.cameras.main.shakeEffect.reset(); this.start();
  }
  private resetClock(): void { this.clock.reset(); this.skipElapsed = true; this.controls?.clear(); }
  private resetViews(): void { for (const id of ['player','enemy'] as const) { this.actors[id].reset(this.world.actors[id]); this.actors[id].advance(0, this.world.actors[id]); } }
  private rebuildStage(): void {
    const g = this.stage; g.clear();
    for (const p of this.world.map.platforms) {
      g.fillStyle(0x050a0d,.4).fillRect(p.x + 6,p.y + 10,p.w,p.h + 8);
      g.fillStyle(0x273338).fillRect(p.x,p.y,p.w,p.h); g.fillStyle(0x66716a).fillRect(p.x,p.y,p.w,5);
      g.fillStyle(0xc99d52).fillRect(p.x,p.y,p.w,2);
      for (let x = p.x + 8; x < p.x + p.w - 8; x += 28) { g.fillStyle(0xb59647,.7).fillTriangle(x,p.y+7,x+13,p.y+7,x+6,p.y+18); g.fillStyle(0x101b20).fillRect(x+17,p.y+9,3,3); }
      if (p.y < 630) {
        g.lineStyle(3,0x616b63,.5).strokeRect(p.x + 14,p.y + p.h,p.w - 28,13);
        for (const x of [p.x + 22,p.x + p.w - 24]) { g.lineStyle(3,0x333d39,.6).lineBetween(x,p.y+p.h+13,x,665); }
      }
    }
    for (const x of [62,1218]) {
      g.fillStyle(0x313e3c).fillRect(x-5,190,10,450); g.fillStyle(0xd8a951).fillRect(x-12,190,24,6);
      g.lineStyle(1,0x83a29a,.3).lineBetween(x,190,640,120);
    }
    text('arena-map', this.world.map.name);
  }
  update(_time: number, delta: number): void {
    if (!this.controls) return;
    const input = this.controls.read();
    if (document.hidden || this.mode === 'paused') return;
    const seconds = this.skipElapsed ? 0 : Math.min(delta / 1000,.25); this.skipElapsed = false;
    if (this.mode === 'ready') {
      this.clock.advance(seconds, NO_INPUT, dt => this.advanceViews(dt));
    } else if (this.mode === 'playing') {
      this.clock.advance(seconds, input, (dt, controls) => {
        for (const event of this.world.step(dt, controls, this.botEnabled ? undefined : NO_INPUT)) this.handleEvent(event);
        this.advanceViews(dt); this.advanceParticles(dt);
      });
      if (this.world.phase === 'matchOver') {
        this.mode = 'finished'; this.resetClock();
        const win = this.world.scores.player >= this.world.target;
        this.effects.play(win ? 'win' : 'lose');
        this.showOverlay('MATCH COMPLETE', win ? 'TOP OF THE PECKING ORDER.' : 'PLUCKED.', `${this.world.scores.player} — ${this.world.scores.enemy}. ${win ? 'The scrapyard is yours.' : 'Dustjaw takes the scrapyard.'}`, 'PLAY AGAIN');
      }
    } else this.clock.advance(seconds, NO_INPUT, dt => { this.advanceViews(dt); this.advanceParticles(dt); });
    this.paint(seconds); this.refreshHud();
  }
  private advanceViews(dt: number): void { for (const id of ['player','enemy'] as const) this.actors[id].advance(dt, this.world.actors[id]); }
  private handleEvent(e: ArenaEvent): void {
    if (e.type === 'next') { this.particles = []; this.rebuildStage(); this.resetViews(); return; }
    if (e.type === 'shot') { this.effects.play(e.weapon === 'pistol' ? 'punch' : 'kick'); this.spawnParticles(e.x,e.y,6,0xffd27a,110,false); }
    if (e.type === 'impact') { this.spawnParticles(e.x,e.y,e.weapon === 'rocket' ? 24 : 7,e.weapon === 'rocket' ? 0xffb84b : 0xe6dbb5,e.weapon === 'rocket' ? 260 : 130,false); if (e.weapon === 'rocket') this.cameras.main.shake(100,.003); }
    if (e.type === 'death') { this.effects.play('hit'); this.spawnParticles(e.x,e.y,20,0xb52c38,180,true); this.cameras.main.shake(70,.002); }
  }
  private spawnParticles(x: number,y: number,count: number,color: number,speed: number,gravity: boolean): void {
    for (let i=0;i<count && this.particles.length<128;i++) { const t = (i * 2.39996 + this.world.time * 7); const life = gravity ? .7 : .24;
      this.particles.push({ x,y,vx:Math.cos(t)*speed*(.3+i%4*.18),vy:Math.sin(t)*speed-30,life,max:life,color,size:gravity?3:2,gravity }); }
  }
  private advanceParticles(dt: number): void { this.particles = this.particles.filter(p => { p.life -= dt; p.x += p.vx*dt; p.y += p.vy*dt; if (p.gravity) p.vy += 750*dt; return p.life > 0; }); }
  private paint(_seconds: number): void {
    const g = this.items; g.clear();
    for (const pickup of this.world.pickups) {
      const bob = Math.sin(this.world.time * 3 + pickup.id)*3, y = pickup.y-21+bob;
      g.fillStyle(pickup.kind === 'rocket' ? 0xe1b65d : 0x6dc9bb,.13).fillEllipse(pickup.x,y+9,62,17);
      drawWeapon(g,pickup.kind,pickup.x,y,1,.9); g.lineStyle(1,0xd7caa0,.45).lineBetween(pickup.x-15,y+24,pickup.x+15,y+24);
    }
    for (const a of Object.values(this.world.actors)) {
      if (a.alive && a.weapon) drawWeapon(g,a.weapon,a.x+9*a.facing-a.flash*75*a.facing,a.y-63,a.facing,1,a.flash>0);
      this.labels[a.id].setPosition(a.x,a.y-116).setVisible(a.alive);
    }
    for (const b of this.world.projectiles) {
      if (b.kind === 'rocket') { g.fillStyle(0xffab53).fillCircle(b.x-Math.sign(b.vx)*9,b.y,5); g.fillStyle(0xe3e0bb).fillRect(b.x-7,b.y-3,14,6); }
      else g.lineStyle(b.kind === 'shotgun'?2:3,0xffe7ac).lineBetween(b.x,b.y,b.x-Math.sign(b.vx)*19,b.y-b.vy*.015);
    }
    this.fx.clear(); for (const p of this.particles) this.fx.fillStyle(p.color,p.life/p.max).fillCircle(p.x,p.y,p.size);
    const phase = this.world.phase, active = this.mode !== 'ready';
    this.banner.setVisible(active && (phase === 'countdown' || phase === 'roundOver'));
    this.subBanner.setVisible(this.banner.visible);
    if (phase === 'countdown') { this.banner.setText(this.world.phaseTime > .6 ? `ROUND ${this.world.round}` : 'DRAW!'); this.subBanner.setText('GRAB A GUN. KEEP YOUR FEATHERS.'); }
    else if (phase === 'roundOver') { this.banner.setText(this.world.winner === 'player' ? 'ROOK TAKES IT.' : this.world.winner === 'enemy' ? 'DUSTJAW TAKES IT.' : 'DRAW.'); this.subBanner.setText(this.world.remaining <= 0 ? 'TIME UP · NEXT ROUND' : 'ONE HIT. ONE LESS DUCK.'); }
    const a = this.world.actors.player;
    const nearby = a.alive && this.world.pickups.find(w => w.availableAt <= this.world.time && Math.abs(w.x-a.x)<64 && Math.abs(w.y-a.y)<62);
    text('arena-pickup-hint', this.mode === 'playing' && this.world.phase === 'playing' && nearby ? `E / EQUIP · ${WEAPONS[nearby.kind].label}` : '');
  }
  private refreshHud(): void {
    text('arena-player-score',String(this.world.scores.player)); text('arena-enemy-score',String(this.world.scores.enemy));
    text('arena-round',`ROUND ${String(this.world.round).padStart(2,'0')}`); text('arena-timer',String(Math.ceil(this.world.remaining)).padStart(2,'0'));
    const a = this.world.actors.player;
    text('arena-weapon',a.weapon ? WEAPONS[a.weapon].label : 'EMPTY HANDED');
    text('arena-ammo',a.weapon ? `${String(a.ammo).padStart(2,'0')} / ${WEAPONS[a.weapon].ammo}` : 'FIND A WEAPON');
    el('arena-weapon-card').classList.toggle('empty',!a.weapon || a.ammo === 0);
  }
  private showOverlay(eyebrow: string,title: string,description: string,button: string): void {
    text('arena-state-eyebrow',eyebrow); text('arena-state-title',title); text('arena-state-description',description); text('arena-resume',button);
    el('arena-state-overlay').hidden = false;
  }
  verificationSnapshot(): object {
    return { mode:this.mode,phase:this.world.phase,time:this.world.time,round:this.world.round,map:this.world.map.name,scores:{...this.world.scores},remaining:this.world.remaining,
      actors:structuredClone(this.world.actors),pickups:structuredClone(this.world.pickups),projectiles:structuredClone(this.world.projectiles),particles:this.particles.length,
      views:Object.fromEntries(Object.entries(this.actors).map(([id,v])=>[id,{pose:structuredClone(v.rigState.pose),complete:v.rigState.complete,scale:v.rigState.scale}])),
      resources:{textures:this.textures.getTextureKeys().length,variants:getRigAssets(this)?.resourceCount ?? 0} };
  }
  setupForVerification(name: 'duel' | 'lethal' | 'platform'): void {
    this.newMatch(); this.world.phase = 'playing'; this.botEnabled = false;
    Object.assign(this.world.actors.player,{x:480,weapon:'pistol',ammo:9}); Object.assign(this.world.actors.enemy,{x:760});
    if (name === 'lethal') this.world.scores.player = 4;
    if (name === 'platform') Object.assign(this.world.actors.player,{x:280,y:477,grounded:true});
    this.resetViews(); this.resetClock(); this.refreshHud(); this.paint(0);
  }
}
