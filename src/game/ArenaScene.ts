import Phaser from 'phaser';
import { createWorld } from '../art/world';
import { CharacterView } from '../art/CharacterView';
import { preloadCharacterAssets } from '../art/characterAssets';
import { CombatWorld, WORLD_WIDTH, type CombatEvent } from './combat';
import { Controls } from './Controls';
import { Sound } from './Sound';

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
  private hitStop = 0;
  private comboUntil = 0;
  private endDelay = 0;
  private cameraX = 0;

  constructor() { super('arena'); }

  preload(): void {
    preloadCharacterAssets(this);
  }

  create(): void {
    createWorld(this);
    this.playerView = new CharacterView(this, this.world.player.x, this.world.player.y, 'rook');
    this.enemyView = new CharacterView(this, this.world.enemy.x, this.world.enemy.y, 'dustjaw');
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
      if (document.hidden) this.pause();
    });
    window.addEventListener('blur', () => this.pause());
    window.addEventListener('resize', () => {
      if (window.innerWidth < 680 && window.innerHeight > window.innerWidth) this.pause();
    });
  }

  enter(): void {
    this.effects.unlock();
    if (this.mode === 'won' || this.mode === 'lost') { this.restart(); return; }
    if (this.mode === 'playing') return;
    this.mode = 'playing';
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
    if (this.mode !== 'playing' || this.world.status !== 'playing') return;
    this.mode = 'paused';
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
    this.hitStop = this.endDelay = this.comboUntil = this.cameraX = 0;
    this.cameras.main.setScroll(0, 0);
    this.warning.setVisible(false);
    el('combo-readout').textContent = '';
    this.refreshHud();
    this.paintFighters(0);
    this.enter();
  }

  update(_time: number, delta: number): void {
    if (!this.controls) return;
    const dt = Math.min(delta / 1000, .05);
    if (this.mode !== 'playing') {
      this.controls.read();
      return;
    }
    if (this.world.status !== 'playing') {
      this.endDelay += dt;
      // The simulation has ended; allow only the visual death clip to finish before the overlay.
      this.paintFighters((this.world.time + this.endDelay) * 1000);
      if (this.endDelay > .85) this.finish();
      return;
    }
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    const events = this.world.step(dt, this.controls.read());
    for (const event of events) this.handleEvent(event);
    this.paintFighters(this.world.time * 1000);
    // Gentle follow, bounded to the full scrolling stage; Y remains fixed across lanes.
    const target = Phaser.Math.Clamp(this.world.player.x - 500, 0, WORLD_WIDTH - 1280);
    this.cameraX += (target - this.cameraX) * (1 - Math.exp(-7 * dt));
    this.cameras.main.setScroll(this.cameraX, 0);
    if (this.world.time > this.comboUntil) el('combo-readout').textContent = '';
    this.refreshHud();
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
    if (event.type !== 'hit') return;
    this.effects.play('hit');
    this.hitStop = event.attack === 'punch3' || event.attack === 'kick' ? .07 : .035;
    this.cameras.main.shake(95, event.target === 'player' ? .004 : .002);
    const x = event.x;
    const y = event.y - 91;
    const burst = this.add.graphics().setPosition(x, y).setDepth(1000);
    burst.lineStyle(4, event.target === 'player' ? 0xe99460 : 0xf4d87f);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      burst.lineBetween(Math.cos(angle) * 10, Math.sin(angle) * 10, Math.cos(angle) * 35, Math.sin(angle) * 30);
    }
    this.tweens.add({targets:burst,alpha:0,scale:1.5,duration:190,onComplete:()=>burst.destroy()});
    const damage = this.add.text(x, y - 28, `−${event.damage}`, {fontFamily:'Arial',fontSize:'23px',fontStyle:'bold',color:event.target === 'player' ? '#ffc2a1' : '#fff0b6',stroke:'#2d3428',strokeThickness:4}).setOrigin(.5).setDepth(1000);
    this.tweens.add({targets:damage,y:y-76,alpha:0,duration:650,onComplete:()=>damage.destroy()});
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
}
