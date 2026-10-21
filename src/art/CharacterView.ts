import Phaser from 'phaser';
import { DuckView } from './DuckView';
import { characterTextureKey, getCharacterSheet } from './characterAssets';
import { CharacterAnimation, type CharacterId, type CharacterPose, type CharacterSheet } from './characterManifest';

/** Ground-anchored rendering only. Combat positions, ranges, and collisions stay in CombatWorld. */
export class CharacterView extends Phaser.GameObjects.Container {
  private readonly fallback: DuckView;
  private readonly sprite?: Phaser.GameObjects.Sprite;
  private readonly shadow?: Phaser.GameObjects.Graphics;
  private readonly sheet?: CharacterSheet;
  private readonly animation = new CharacterAnimation();

  constructor(scene: Phaser.Scene, x: number, y: number, id: CharacterId) {
    super(scene, x, y);
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
  }

  renderPose(pose: CharacterPose): void {
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
