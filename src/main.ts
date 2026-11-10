import Phaser from 'phaser';
import './arena/arena.css';
import { ShooterScene } from './arena/ShooterScene';

const game = new Phaser.Game({
  type: Phaser.CANVAS, parent: 'arena-canvas', width: 1280, height: 720,
  backgroundColor: '#17242a', antialias: true, roundPixels: false,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 5 }, audio: { noAudio: true }, scene: [ShooterScene],
});
if (import.meta.env.DEV) Object.defineProperty(window, '__duckArena', { value: {
  snapshot: () => (game.scene.getScene('shooter') as ShooterScene).verificationSnapshot(),
  setup: (name: 'duel' | 'lethal' | 'platform') => (game.scene.getScene('shooter') as ShooterScene).setupForVerification(name),
}});
