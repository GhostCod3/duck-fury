import Phaser from 'phaser';
import { CHARACTER_IDS, parseCharacterManifest, validSheetGrid, type CharacterId, type CharacterSheet } from './characterManifest';

const MANIFEST_KEY = 'duck-fury:character-manifest';
const ROOT = `${import.meta.env.BASE_URL}assets/characters/`;
const loaded = new WeakMap<Phaser.Scene, Partial<Record<CharacterId, CharacterSheet>>>();
export const characterTextureKey = (id: CharacterId) => `duck-fury:character:${id}`;

/** The shipped empty manifest loads no images. Missing or broken packs remain optional. */
export function preloadCharacterAssets(scene: Phaser.Scene): void {
  loaded.set(scene, {});
  let definitions: Partial<Record<CharacterId, CharacterSheet>> = {};
  const warn = (message: string) => console.warn(`[DUCK FURY sprites] ${message}`);
  const onError = (file: Phaser.Loader.File) => {
    if (file.key === MANIFEST_KEY || file.key.startsWith('duck-fury:character:')) {
      warn(`Could not load ${file.key}; using procedural fallback.`);
    }
  };
  const onManifest = (_key: string, _type: string, data: unknown) => {
    const parsed = parseCharacterManifest(data);
    definitions = parsed.characters;
    parsed.warnings.forEach(warn);
    for (const id of CHARACTER_IDS) {
      const sheet = definitions[id];
      if (!sheet) continue;
      scene.load.spritesheet(characterTextureKey(id), `${ROOT}${sheet.sheet}`, {
        frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight,
        startFrame: 0, endFrame: sheet.frameCount - 1,
      });
    }
  };
  const event = `filecomplete-json-${MANIFEST_KEY}`;
  scene.load.once(event, onManifest);
  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
    scene.load.off(event, onManifest);
    scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    const ready: Partial<Record<CharacterId, CharacterSheet>> = {};
    for (const id of CHARACTER_IDS) {
      const sheet = definitions[id];
      const key = characterTextureKey(id);
      if (!sheet || !scene.textures.exists(key)) continue;
      const texture = scene.textures.get(key);
      const image = texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      if (!validSheetGrid(sheet, image.width, image.height) ||
          Object.values(sheet.animations).some(clip => clip?.frames.some(frame => !texture.has(String(frame))))) {
        warn(`${id}: decoded sheet dimensions or frames do not match the manifest; using procedural fallback.`);
        scene.textures.remove(key);
        continue;
      }
      ready[id] = sheet;
    }
    loaded.set(scene, ready);
  });
  scene.load.json(MANIFEST_KEY, `${ROOT}manifest.json`);
}

export function getCharacterSheet(scene: Phaser.Scene, id: CharacterId): CharacterSheet | undefined {
  return loaded.get(scene)?.[id];
}
