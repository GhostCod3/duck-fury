import Phaser from 'phaser';
import { PANORAMA_KEY } from './rig/rigAssets';

export interface WorldPresentation { update(time: number, cameraX: number): void }
export function createPaintedWorld(scene: Phaser.Scene): WorldPresentation | undefined {
  if (!scene.textures.exists(PANORAMA_KEY)) return undefined;
  const image = scene.textures.get(PANORAMA_KEY).getSourceImage() as HTMLImageElement;
  if (image.width !== 2172 || image.height !== 724) return undefined;
  const roadY = 434, fade = 24, sourceY = image.height * 312 / 440, tileWidth = 2160;
  if (!scene.textures.exists('approved-stage:back')) {
    const back = document.createElement('canvas'); back.width = 1786; back.height = 720;
    const ctx = back.getContext('2d')!, scale = roadY / sourceY;
    ctx.drawImage(image, 0, 0, image.width * scale, image.height * scale);
    scene.textures.addCanvas('approved-stage:back', back);
    const road = document.createElement('canvas'); road.width = tileWidth; road.height = 720 - roadY;
    const g = road.getContext('2d')!;
    g.drawImage(image, 0, sourceY, image.width, image.height - sourceY, 0, 0, tileWidth, road.height);
    const mask = g.createLinearGradient(0, 0, 0, fade); mask.addColorStop(0, 'rgba(0,0,0,0)'); mask.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = mask; g.fillRect(0, 0, road.width, road.height);
    scene.textures.addCanvas('approved-stage:road', road);
  }
  scene.add.image(0, 0, 'approved-stage:back').setOrigin(0).setScrollFactor(.38, 1).setDepth(-100);
  const tiles = [0, 1].map(i => scene.add.image(i * tileWidth, roadY, 'approved-stage:road').setOrigin(0).setFlipX(i % 2 === 1).setDepth(-60));
  const dust = scene.add.graphics().setScrollFactor(0).setDepth(-10);
  return {
    update(time: number, cameraX: number): void {
      for (const tile of tiles) tile.setVisible(tile.x + tileWidth >= cameraX && tile.x <= cameraX + 1280);
      dust.clear();
      for (let i = 0; i < 18; i++) {
        const span = 1340, x = ((i * 173 + time * (8 + i % 4) - cameraX * .65) % span + span) % span - 30;
        const y = 350 + (i * 43) % 220 + Math.sin(time * .45 + i * 2) * 5;
        dust.fillStyle(0xdc9e51, .06 + i % 3 * .025).fillEllipse(x, y, 1.2 + i % 3 * .54, .8 + i % 2 * .36);
      }
    },
  };
}
