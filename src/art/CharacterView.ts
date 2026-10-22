import Phaser from 'phaser';
import { DuckView } from './DuckView';
import { characterTextureKey, getCharacterSheet } from './characterAssets';
import { CharacterAnimation, type CharacterId, type CharacterPose, type CharacterSheet } from './characterManifest';
import { getRigAssets } from './rig/rigAssets';
import { RigCharacterView } from './rig/RigCharacterView';
import type { RigSnapshot } from './rig/RigState';
import type { Vec } from './rig/RigMath';
import { AttackRecovery } from './CharacterPresentation';

/** Ground-anchored rendering only. Combat positions, ranges, and collisions stay in CombatWorld. */
export class CharacterView extends Phaser.GameObjects.Container {
  private readonly fallback: DuckView;
  private readonly sprite?: Phaser.GameObjects.Sprite;
  private readonly shadow?: Phaser.GameObjects.Graphics;
  private readonly sheet?: CharacterSheet;
  private readonly animation = new CharacterAnimation();
  readonly rig?: RigCharacterView;
  private readonly recovery = new AttackRecovery();
  private pose: RigSnapshot;

  constructor(scene: Phaser.Scene, x: number, y: number, id: CharacterId) {
    super(scene, x, y);
    this.pose = { x, y, facing: id === 'rook' ? 1 : -1, moving: false, attack: null, progress: 0, hurt: false, dead: false, time: 0 };
    scene.add.existing(this);
    this.fallback = new DuckView(scene, 0, 0, id === 'dustjaw');
    this.add(this.fallback);
    this.sheet = getCharacterSheet(scene, id);
    if (this.sheet) {
      this.shadow = scene.add.graphics();
      this.sprite = scene.add.sprite(0, 0, characterTextureKey(id), this.sheet.animations.idle!.frames[0]);
      this.sprite.setOrigin(this.sheet.origin.x, this.sheet.origin.y).setScale(this.sheet.scale);
      this.add([this.shadow, this.sprite]);
    }
    const rigAssets = getRigAssets(scene);
    if (rigAssets) {
      this.rig = new RigCharacterView(scene, id === 'dustjaw', rigAssets, { x, y, facing: id === 'rook' ? 1 : -1, moving: false, attack: null, progress: 0, hurt: false, dead: false, time: 0 });
      this.add(this.rig);
    }
  }

  get presentationPose(): Readonly<RigSnapshot> { return this.pose; }
  advancePresentation(dt: number, pose: RigSnapshot, target?: Vec, combatStopped = false): void {
    this.pose = this.recovery.advance(dt, pose, combatStopped);
    this.rig?.rigState.advance(dt, this.pose, target);
  }
  resetPresentation(pose: RigSnapshot): void { this.recovery.reset(); this.pose = { ...pose }; this.rig?.rigState.reset(pose); }
  onHit(heavy: boolean): void { this.rig?.rigState.addWound(heavy); }
  lockContact(point: Vec): void { this.rig?.rigState.lockContact(point); }
  beginKnockout(pose: RigSnapshot): void { this.rig?.rigState.beginKnockout(pose); }
  hurtAnchor(from?: Vec): Vec { return this.rig?.rigState.hurtAnchor(from) ?? { x: this.x, y: this.y - 91 }; }
  telegraphAnchor(): Vec {
    const state = this.rig?.rigState;
    return state ? state.worldPoint({ x: state.pose.neck.x, y: state.pose.neck.y - 100 }) : { x: this.x, y: this.y - 185 };
  }
  get knockoutComplete(): boolean { return this.rig?.rigState.complete ?? true; }

  renderPose(pose: CharacterPose): void {
    if (this.rig) {
      this.fallback.setVisible(false); this.sprite?.setVisible(false); this.shadow?.setVisible(false);
      return;
    }
    const frame = this.sheet ? this.animation.frame(this.sheet, pose) : undefined;
    const useSprite = frame !== undefined && this.sprite !== undefined;
    this.fallback.setVisible(!useSprite);
    this.sprite?.setVisible(useSprite);
    this.shadow?.setVisible(useSprite);
    if (!useSprite || !this.sprite) {
      this.fallback.renderPose(pose);
      return;
    }
    this.sprite.setFrame(frame).setFlipX(pose.facing === -1);
    // Constant proportions and origin. Every motion is a distinct authored image frame.
    this.shadow?.clear().fillStyle(0x161d1a, .3).fillEllipse(0, -1, pose.dead ? 125 : 84, 19);
  }
}
