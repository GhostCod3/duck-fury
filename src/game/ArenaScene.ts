import Phaser from 'phaser';
import { createWorld } from '../art/world';
import { CharacterView } from '../art/CharacterView';
import { preloadCharacterAssets } from '../art/characterAssets';
import { CombatWorld, WORLD_WIDTH, type CombatEvent } from './combat';
import { Controls } from './Controls';
import { Sound } from './Sound';
import { FrameStepper } from './FrameStepper';
import { preloadRigAssets, getRigAssets } from '../art/rig/rigAssets';
import { BloodEffects } from '../art/BloodEffects';
import type { WorldPresentation } from '../art/PaintedWorld';
import type { RigSnapshot } from '../art/rig/RigState';
import type { Fighter } from './combat';

export type PlayMode = 'ready' | 'playing' | 'paused' | 'won' | 'lost';
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class ArenaScene extends Phaser.Scene {
  world = new CombatWorld();
  mode: PlayMode = 'ready';
  controls!: Controls;
  readonly effects = new Sound();
  private playerView!: CharacterView;
  private enemyView!: CharacterView;
  private warning!: Phaser.GameObjects.Text;
  private readonly stepper = new FrameStepper();
  private presentationTime = 0;
  private skipElapsed = true;
  private blood!: BloodEffects;
  private stage!: WorldPresentation;
  private readonly transient = new Set<Phaser.GameObjects.Graphics | Phaser.GameObjects.Text>();
  private comboUntil = 0;
  private endDelay = 0;
  private cameraX = 0;

  constructor() { super('arena'); }

  preload(): void {
    preloadRigAssets(this);
    preloadCharacterAssets(this);
  }

  create(): void {
    this.stage = createWorld(this);
    this.playerView = new CharacterView(this, this.world.player.x, this.world.player.y, 'rook');
    this.enemyView = new CharacterView(this, this.world.enemy.x, this.world.enemy.y, 'dustjaw');
    this.blood = new BloodEffects(this);
    this.warning = this.add.text(0, 0, '!', {fontFamily:'Arial',fontSize:'28px',fontStyle:'bold',color:'#f3ba59',stroke:'#343a2b',strokeThickness:5}).setOrigin(.5).setDepth(900).setVisible(false);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, 720);
    this.controls = new Controls(() => this.togglePause(), () => this.enter());
    this.wireInterface();
    this.paintFighters(0);
    el('game-frame').classList.add('ready');
    el('loading').hidden = true;
    this.refreshHud();
  }

  private wireInterface(): void {
    el('start-button').addEventListener('click', () => this.enter());
    el('pause-button').addEventListener('click', () => this.togglePause());
    el('resume-button').addEventListener('click', () => this.enter());
    el('restart-button').addEventListener('click', () => this.restart());
    el('sound-button').addEventListener('click', () => {
      this.effects.unlock();
      this.effects.enabled = !this.effects.enabled;
      el('sound-button').textContent = this.effects.enabled ? '♪' : '♩';
      el('sound-button').style.opacity = this.effects.enabled ? '1' : '.5';
      el('sound-button').setAttribute('aria-label', this.effects.enabled ? 'Mute sound' : 'Enable sound');
      el('sound-button').title = this.effects.enabled ? 'Sound on' : 'Sound off';
    });
    el('fullscreen-button').addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await el('game-frame').requestFullscreen();
      } catch { el('fullscreen-button').title = 'Fullscreen is unavailable in this browser'; }
    });
    document.addEventListener('fullscreenchange', () => {
      el('fullscreen-button').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
    });
    const help = el<HTMLDialogElement>('help-dialog');
    el('help-button').addEventListener('click', () => {
      if (this.mode === 'playing') this.togglePause();
      help.showModal();
    });
    el('close-help').addEventListener('click', () => help.close());
    el('help-done').addEventListener('click', () => help.close());
    document.addEventListener('visibilitychange', () => {
      this.resetClock();
      if (document.hidden) this.pause();
    });
    window.addEventListener('blur', () => { this.resetClock(); this.pause(); });
    window.addEventListener('resize', () => {
      if (window.innerWidth < 680 && window.innerHeight > window.innerWidth) this.pause();
    });
  }

  enter(): void {
    this.effects.unlock();
    if (this.mode === 'won' || this.mode === 'lost') { this.restart(); return; }
    if (this.mode === 'playing') return;
    this.mode = 'playing';
    this.resetClock();
    this.tweens.resumeAll();
    this.controls.clear();
    el('start-overlay').hidden = true;
    el('state-overlay').hidden = true;
    el('game-frame').classList.remove('ready');
    el('enemy-hud').hidden = false;
    el('pause-button').textContent = 'Ⅱ';
    el('pause-button').setAttribute('aria-label', 'Pause game');
    el('mission-text').textContent = 'DEFEAT DUSTJAW';
  }

  pause(): void {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.resetClock();
    this.tweens.pauseAll();
    this.cameras.main.shakeEffect.reset();
    this.controls.clear();
    this.showState('TAKE A BREATHER', 'PAUSED.', 'The wasteland can wait.', 'BACK TO THE FIGHT');
    el('pause-button').textContent = '▶';
    el('pause-button').setAttribute('aria-label', 'Resume game');
  }

  togglePause(): void {
    if (this.mode === 'paused') this.enter();
    else this.pause();
  }

  restart(): void {
    this.world = new CombatWorld();
    this.mode = 'ready';
    this.endDelay = this.comboUntil = this.cameraX = this.presentationTime = 0;
    this.resetClock();
    this.blood.reset();
    for (const object of this.transient) { this.tweens.killTweensOf(object); object.destroy(); }
    this.transient.clear();
    this.playerView.resetPresentation(this.snapshot(this.world.player));
    this.enemyView.resetPresentation(this.snapshot(this.world.enemy));
    this.cameras.main.setScroll(0, 0);
    this.warning.setVisible(false);
    el('combo-readout').textContent = '';
    this.refreshHud();
    this.paintFighters(0);
    this.enter();
  }

  update(_time: number, delta: number): void {
    if (!this.controls) return;
    const sampled = this.controls.read(); // Exactly once per rendered frame, including zero-step frames.
    if (this.mode === 'paused' || document.hidden) { this.stepper.reset(); return; }
    const elapsed = this.skipElapsed ? 0 : Math.min(delta / 1000, .25);
    this.skipElapsed = false;
    const input = this.mode === 'playing' && this.world.status === 'playing' ? sampled : { x: 0, y: 0, punch: false, kick: false };
    this.stepper.advance(elapsed, input, (dt, stepInput, stopped) => {
      this.blood.model.advance(dt * 1.3);
      if (this.mode === 'won' || this.mode === 'lost') return;
      if (stopped && this.world.status === 'playing') return;
      this.presentationTime += dt;
      if (this.mode === 'playing' && this.world.status === 'playing') {
        for (const event of this.world.step(dt, stepInput)) this.handleEvent(event);
      }
      this.advanceViews(dt);
      if (this.mode === 'playing' && this.world.status !== 'playing') {
        this.endDelay += dt;
        const victim = this.world.status === 'won' ? this.enemyView : this.playerView;
        if (this.endDelay >= .85 && victim.knockoutComplete) this.finish();
      }
    });
    const target = Phaser.Math.Clamp(this.world.player.x - 500, 0, WORLD_WIDTH - 1280);
    this.cameraX += (target - this.cameraX) * (1 - Math.exp(-7 * elapsed));
    this.cameras.main.setScroll(this.cameraX, 0);
    this.paintFighters(this.presentationTime * 1000);
    this.blood.draw();
    this.stage.update(this.presentationTime * 1.3, this.cameraX);
    if (this.world.time > this.comboUntil) el('combo-readout').textContent = '';
    this.refreshHud();
  }

  private resetClock(): void { this.stepper.reset(); this.skipElapsed = true; this.controls?.clear(); }
  private snapshot(fighter: Fighter): RigSnapshot { return { ...fighter, progress: fighter.attackProgress, time: this.presentationTime * 1000 }; }
  private advanceViews(dt: number): void {
    const player = this.world.player, enemy = this.world.enemy;
    const playerTarget = Math.abs(player.y - enemy.y) <= 32 && (enemy.x - player.x) * player.facing >= 0 ? this.enemyView.hurtAnchor() : undefined;
    const enemyTarget = Math.abs(player.y - enemy.y) <= 32 && (player.x - enemy.x) * enemy.facing >= 0 ? this.playerView.hurtAnchor() : undefined;
    this.playerView.advancePresentation(dt, this.snapshot(player), playerTarget);
    this.enemyView.advancePresentation(dt, this.snapshot(enemy), enemyTarget);
  }

  private paintFighters(time: number): void {
    for (const [fighter, view] of [[this.world.player, this.playerView], [this.world.enemy, this.enemyView]] as const) {
      view.setPosition(fighter.x, fighter.y).setDepth(fighter.y);
      view.renderPose({facing:fighter.facing,moving:fighter.moving,attack:fighter.attack,progress:fighter.attackProgress,hurt:fighter.hurt,dead:fighter.dead,time});
    }
    const enemy = this.world.enemy;
    this.warning.setPosition(enemy.x, enemy.y - 185).setVisible(enemy.attack === 'enemy' && enemy.attackProgress < .65 && !enemy.dead);
  }

  private handleEvent(event: CombatEvent): void {
    if (event.type === 'attack') {
      if (event.target === 'player') this.effects.play(event.attack === 'kick' ? 'kick' : 'punch');
      return;
    }
    if (event.type === 'death') {
      const victim = event.target === 'player' ? this.playerView : this.enemyView;
      victim.beginKnockout(this.snapshot(event.target === 'player' ? this.world.player : this.world.enemy));
      return;
    }
    if (event.type !== 'hit') return;
    this.effects.play('hit');
    const heavy = event.attack === 'punch3' || event.attack === 'kick';
    this.stepper.stopFor(heavy ? .07 : .035);
    this.cameras.main.shake(95, event.target === 'player' ? .004 : .002);
    const victim = event.target === 'player' ? this.playerView : this.enemyView;
    const attacker = event.target === 'player' ? this.enemyView : this.playerView;
    const target = event.target === 'player' ? this.world.player : this.world.enemy;
    const source = event.target === 'player' ? this.world.enemy : this.world.player;
    const point = victim.hurtAnchor();
    victim.onHit(heavy); attacker.lockContact(point);
    this.blood.model.burst(point, target.y, source.facing, heavy, victim.rig?.rigState.scale ?? 1);
    const x = point.x, y = point.y;
    const burst = this.add.graphics().setPosition(x, y).setDepth(1000);
    this.transient.add(burst);
    burst.lineStyle(4, event.target === 'player' ? 0xe99460 : 0xf4d87f);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      burst.lineBetween(Math.cos(angle) * 10, Math.sin(angle) * 10, Math.cos(angle) * 35, Math.sin(angle) * 30);
    }
    this.tweens.add({targets:burst,alpha:0,scale:1.5,duration:190,onComplete:()=>{ this.transient.delete(burst); burst.destroy(); }});
    const damage = this.add.text(x, y - 28, `−${event.damage}`, {fontFamily:'Arial',fontSize:'23px',fontStyle:'bold',color:event.target === 'player' ? '#ffc2a1' : '#fff0b6',stroke:'#2d3428',strokeThickness:4}).setOrigin(.5).setDepth(1000);
    this.transient.add(damage);
    this.tweens.add({targets:damage,y:y-76,alpha:0,duration:650,onComplete:()=>{ this.transient.delete(damage); damage.destroy(); }});
    if (event.target === 'enemy') {
      el('combo-readout').textContent = event.attack === 'kick' ? 'MAKE SOME ROOM.' : event.combo === 3 ? '3 HIT · FURY!' : `${event.combo} HIT`;
      this.comboUntil = this.world.time + 1.2;
    }
  }

  private refreshHud(): void {
    el('player-health').style.width = `${this.world.player.hp}%`;
    el('hp-number').textContent = `${this.world.player.hp} / 100`;
    el('enemy-health').style.width = `${this.world.enemy.hp / this.world.enemy.maxHp * 100}%`;
  }

  private finish(): void {
    this.mode = this.world.status === 'won' ? 'won' : 'lost';
    this.controls.clear();
    this.warning.setVisible(false);
    const won = this.mode === 'won';
    this.effects.play(won ? 'win' : 'lose');
    el('mission-text').textContent = won ? 'FUEL STOP CLEARED' : 'ROOK IS DOWN';
    this.showState(won ? 'SECTOR 07 / ENCOUNTER COMPLETE' : 'THE WASTELAND HIT BACK', won ? 'DUST SETTLED.' : 'DUCK DOWN.', won ? `Dustjaw is down. You survived with ${this.world.player.hp} health.` : 'Shake off the dust. There’s another fight in you.', 'RUN IT BACK');
  }

  private showState(eyebrow: string, title: string, description: string, button: string): void {
    el('state-eyebrow').textContent = eyebrow;
    el('state-title').textContent = title;
    el('state-description').textContent = description;
    el('resume-button').replaceChildren(document.createTextNode(button), Object.assign(document.createElement('span'), {textContent:'→'}));
    el('restart-button').hidden = this.mode !== 'paused';
    el('state-overlay').hidden = false;
  }

  /** Development-only fixtures use the real scene, controls, events, and CombatWorld. */
  setupForVerification(options: { left?: boolean; miss?: boolean; lethal?: boolean; edge?: boolean } = {}): void {
    if (!import.meta.env.DEV) throw new Error('Verification fixtures are development-only');
    this.restart();
    const player = this.world.player, enemy = this.world.enemy;
    player.x = options.edge ? 2300 : options.left ? 650 : 540;
    enemy.x = options.edge ? 2400 : options.miss ? 1300 : options.left ? 580 : 610;
    player.facing = options.left ? -1 : 1; enemy.facing = options.left ? 1 : -1;
    player.y = enemy.y = 560;
    if (options.lethal) enemy.hp = 1;
    this.playerView.resetPresentation(this.snapshot(player)); this.enemyView.resetPresentation(this.snapshot(enemy));
    this.cameraX = Phaser.Math.Clamp(player.x - 500, 0, WORLD_WIDTH - 1280);
    this.cameras.main.setScroll(this.cameraX, 0); this.paintFighters(0); this.refreshHud();
  }

  verificationSnapshot(): object {
    const view = (v: CharacterView) => {
      const s = v.rig?.rigState;
      return s ? { renderer: 'rig', wounds: s.wounds, scale: s.scale, complete: s.complete, deadTime: s.deadTime, pose: s.pose, spring: { ...s.spring }, strike: s.strikePoint(), hurtAnchor: s.hurtAnchor() } : { renderer: 'fallback' };
    };
    return { presentationTime: this.presentationTime, views: { player: view(this.playerView), enemy: view(this.enemyView) }, blood: { droplets: this.blood.model.droplets.map(q => ({ ...q })), stains: this.blood.model.stains.map(q => ({ ...q })) }, resources: { variants: getRigAssets(this)?.resourceCount ?? 0, textures: this.textures.getTextureKeys().length, transient: this.transient.size } };
  }
}
