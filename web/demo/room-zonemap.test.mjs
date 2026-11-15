// The demo's ROOM_ZONE_MAP is the same 4 quadrants as core's basicRoomZoneMap() (the editor's
// "Sim: basic room", Aurora-u8jx.6.1) and the dev stack's room-4zone-zonemap.json, in the same order.
// Run with `node room-zonemap.test.mjs`. room-rig.js imports three, so the source text is read, not loaded.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shared = JSON.parse(readFileSync(new URL('../../tools/fake-hue-bridge/room-4zone-zonemap.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('./room-rig.js', import.meta.url), 'utf8');
const block = source.match(/export const ROOM_ZONE_MAP = (\[[\s\S]*?\n\]);/);
assert.ok(block, 'ROOM_ZONE_MAP is declared in room-rig.js');
// The block is a plain array literal of object literals, so it evaluates without the rest of the module.
const demo = new Function(`return ${block[1]}`)();

assert.equal(demo.length, shared.length, 'same zone count');
demo.forEach((zone, i) => {
  assert.deepEqual(zone.uvs, shared[i].uvs, `zone ${i} uvs`);
  assert.equal(zone.active, shared[i].active, `zone ${i} active`);
  assert.equal(zone.gamma, shared[i].gamma, `zone ${i} gamma`);
});
console.log('room-zonemap ok');
