import Phaser from 'phaser';
import './style.css';
import { ArenaScene } from './game/ArenaScene';

const game = new Phaser.Game({
  type: Phaser.CANVAS,
  parent: 'game-canvas',
  width: 1280,
  height: 720,
  backgroundColor: '#9b9f85',
  antialias: true,
  roundPixels: false,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 4 },
  audio: { noAudio: true },
  scene: [ArenaScene],
});

// Read-only browser QA snapshot; available solely in Vite development mode.
if (import.meta.env.DEV) {
  Object.defineProperty(window, '__duckFury', {value: {
    snapshot: () => {
      const scene = game.scene.getScene('arena') as ArenaScene;
      return {mode:scene.mode,status:scene.world.status,player:{...scene.world.player},enemy:{...scene.world.enemy},combo:scene.world.combo,time:scene.world.time,cameraX:scene.cameras.main.scrollX};
    },
  }});
}
