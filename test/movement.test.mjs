import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { syncMotion } from '../src/client/motion.js';
import { SEATS, LEAD_BOUNDS, TEAM_BOUNDS, WIDTH, HEIGHT } from '../src/art/pixel-office.mjs';

// Exercise actual Character + pathfinding on the shipped collision map, without a GPU or model.
test('every office member can leave its desk, keep roaming, and return when work starts', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await mkdir(join(root, '.local'), { recursive: true });
  const temp = await mkdtemp(join(root, '.local/movement-'));
  const raf = globalThis.requestAnimationFrame, caf = globalThis.cancelAnimationFrame, random = Math.random;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  let seed = 12345;
  Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const characters = []; let map, atlas;
  try {
    await build({ stdin: { contents: "export { PIXEL_SITES, createPixelActivities } from './src/client/pixel-activities.js'; export { findPath } from './vendor/munder/office/pathfinding'; export { Character } from './vendor/munder/office/Character'; export { TiledMapRenderer } from './vendor/munder/office/TiledMapRenderer'; export { Texture, TextureSource } from 'pixi.js';", resolveDir: root, loader: 'ts' },
      outfile: join(temp, 'motion.mjs'), bundle: true, platform: 'node', format: 'esm', external: ['pixi.js'],
      alias: { '@/design/tokens': join(root, 'vendor/munder/design/tokens.ts') } });
    const { Character, TiledMapRenderer, Texture, TextureSource, findPath, PIXEL_SITES, createPixelActivities } = await import(pathToFileURL(join(temp, 'motion.mjs')));
    const data = JSON.parse(await readFile(join(root, 'src/assets/studio/office.tmj'), 'utf8'));
    atlas = new Texture({ source: new TextureSource({ width: WIDTH * 16, height: HEIGHT * 16 }) });
    map = new TiledMapRenderer(data, [atlas]);
    for (const name of SEATS) {
      const desk = map.getSpawnPoint(name);
      for(const [kind,p] of Object.entries(PIXEL_SITES)) assert.ok(findPath(map,desk,{x:p[0],y:p[1]}),`${name} reaches ${kind}`);
      const visit = findPath(map, desk, map.getSpawnPoint('lead-visitor'));
      assert.ok(visit?.length, `${name} has a real route through the doorway to the Lead visitor point`);
      const character = new Character({ agentId: name, mapRenderer: map, frames: Array.from({ length: 3 }, () => Array(7).fill(Texture.EMPTY)), seatTile: desk, roamBounds: name === 'lead-desk' ? LEAD_BOUNDS : TEAM_BOUNDS, seatDirection: 'up', glowColor: 0xffffff });
      characters.push(character); character.show(map.getCharacterContainer());
      syncMotion(character, 'inactive', null);
      const positions = new Set();
      for (let i = 0; i < 4800; i++) {
        character.update(1 / 60);
        if (name === 'lead-desk') {
          const at = character.getTilePosition();
          assert.ok(at.x >= LEAD_BOUNDS.minX && at.x <= LEAD_BOUNDS.maxX && at.y >= LEAD_BOUNDS.minY && at.y <= LEAD_BOUNDS.maxY, 'Lead never leaves its office while idle');
        }
        if (i > 3600) positions.add(JSON.stringify(character.getTilePosition()));
      }
      assert.ok(positions.size > 2, `${name} must still roam after a minute`);
      syncMotion(character, 'running', 'roam');
      for (let i = 0; i < 3600; i++) character.update(1 / 60);
      assert.deepEqual(character.getTilePosition(), desk, `${name} returns to its own desk`);
      assert.equal(character.getAnimation(), 'type', `${name} types while working`);
      syncMotion(character, 'provisioning', 'work');
      assert.equal(character.getAnimation(), 'idle', `${name} stops typing while waiting`);
    }
    // Run the shipped scheduler and Character callbacks through every choreography.
    const entries=new Map(SEATS.map((id,i)=>[id,{character:characters[i],status:'running',motion:'work'}]));
    const roster=SEATS.map((id,i)=>({id,role:i?'teammate':'lead',status:'running'}));
    for(const kind of ['coffee','water','plant','window','fridge','books','bin','smoke','pin','archive','message','handoff']) {
      const actions=[];
      const effects={clear(){},reset(){},envelope(){},action:(id,action)=>actions.push(action)};
      const director=createPixelActivities({characters:entries,map,world:map.getContainer(),effects});
      director.update(roster);
      director.enqueue([{id:kind,kind,actor:SEATS[16],target:['message','handoff'].includes(kind)?SEATS[0]:undefined,at:Date.now(),celebrate:kind==='archive'}]);
      for(let frame=0;frame<150*30;frame++) {director.tick(1/30);for(const c of characters)c.update(1/30);}
      assert.ok(actions.length,`${kind}: reaches the interaction`);
      assert.equal(director.owns(SEATS[16]),false,`${kind}: releases ownership`);
      assert.deepEqual(characters[16].getTilePosition(),characters[16].getDeskTile(),`${kind}: returns to desk`);
      if(kind==='coffee')assert.deepEqual(actions,['cup','brew','drink','wash','put-cup']);
      if(kind==='archive')assert.ok(actions.includes('cheer'));
      director.dispose();
    }
  } finally {
    for (const character of characters) character.destroy();
    map?.getContainer().destroy({ children: true }); atlas?.destroy(true);
    Math.random = random; globalThis.requestAnimationFrame = raf; globalThis.cancelAnimationFrame = caf;
    await rm(temp, { recursive: true, force: true });
  }
});
