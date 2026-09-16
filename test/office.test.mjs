import test from 'node:test';
import assert from 'node:assert/strict';
import { readOfficeSnapshot } from '../src/host/snapshot.js';
import { apply } from '../src/host/index.js';
import { officeSessionId, reconcileSeats } from '../src/shared.js';
import { pollSnapshot } from '../src/client/poll.js';
import { syncMotion } from '../src/client/motion.js';

test('inactive and idle members roam without restarting; work interrupts the walk', () => {
  const calls = [];
  const character = { setStatusGlyph: glyph => calls.push(['glyph', glyph]), setBaseAlpha: () => {},
    startWandering: restAtDesk => { assert.equal(restAtDesk, false); calls.push(['roam']); }, sitAtDesk: working => calls.push(['desk', working]) };
  let motion = syncMotion(character, 'inactive', null);
  motion = syncMotion(character, 'inactive', motion);
  motion = syncMotion(character, 'idle', motion);
  assert.equal(calls.filter(([kind]) => kind === 'roam').length, 1);
  motion = syncMotion(character, 'running', motion);
  assert.deepEqual(calls.at(-1), ['desk', true]);
  motion = syncMotion(character, 'failed', motion);
  assert.deepEqual(calls.slice(-2), [['glyph', 'blocked'], ['desk', false]]);
  motion = syncMotion(character, 'provisioning', motion);
  assert.equal(motion, 'wait');
  syncMotion(character, 'idle', motion);
  assert.deepEqual(calls.at(-1), ['roam']);
});

const root = { id: 'root', session: { header: { title: 'Office test' } } };
const child = { id: 'child', session: { header: { parentSession: 'root' } } };
test('a dormant member opened in the browser addresses its root Team', () => {
  const sessions = { binding: id => id === 'child' ? { session: { getSnapshot: () => ({ subagent: { address: { parentSessionId: 'root' } } }) } } : undefined };
  assert.equal(officeSessionId(sessions, 'child'), 'root');
  assert.equal(officeSessionId(sessions, 'root'), 'root');
  assert.equal(officeSessionId(sessions, null), null);
});
function context() {
  const members = [ { id: 'root', name: 'lead', role: 'lead', status: 'running', diagnostics: [] },
    { id: 'child', name: 'builder', role: 'teammate', status: 'inactive', diagnostics: ['closed'] } ];
  return { agents: { list: () => [root, child], get: id => ({ root, child }[id]) },
    get: () => ({ tryMembership: () => ({ root }), remoteView: agent => {
      assert.equal(agent, root); return { members, tasks: [{ id: 'task', subject: 'build', status: 'pending' }] };
    } }) };
}
test('a member view resolves to its lead and preserves inactive state and diagnostics', () => {
  const view = readOfficeSnapshot(context(), 'child');
  assert.equal(view.leadId, 'root'); assert.equal(view.members[1].status, 'inactive');
  assert.deepEqual(view.members[1].diagnostics, ['closed']);
  assert.equal(view.tasks[0].subject, 'build');
});
test('disabled Teams, no selection and disposed sessions have explicit empty states', () => {
  assert.equal(readOfficeSnapshot({ get: () => undefined }, null).state, 'disabled');
  assert.equal(readOfficeSnapshot(context(), null).state, 'unselected');
  assert.equal(readOfficeSnapshot(context(), 'gone').state, 'inactive');
});
test('roster reordering keeps seats; removal frees seats; overflow never duplicates one', () => {
  const a = { id: 'a', role: 'lead' }, b = { id: 'b', role: 'teammate' }, c = { id: 'c', role: 'teammate' };
  const original = reconcileSeats(new Map(), [b, a], 2);
  assert.equal(original.get('a'), 0); assert.equal(original.get('b'), 1);
  assert.deepEqual(reconcileSeats(original, [a, b], 2), original);
  const next = reconcileSeats(original, [a, c], 2); assert.equal(next.get('c'), 1);
  assert.equal(reconcileSeats(next, [a, b, c], 2).size, 2);
});
test('native Connection route validates requests and returns a standard RPC envelope', async () => {
  const ctx = context(); ctx.on = () => () => {}; ctx.sessionProjections = {stateOf:()=>({messages:[],delivered:[]})}; ctx.sessions = {flush:async()=>true}; let route; let disposed = false;
  ctx.effect = callback => { const cleanup = callback(); ctx.cleanup = cleanup; };
  ctx.connection = { fetch: { register: value => { route = value; return () => { disposed = true; }; } } };
  apply(ctx);
  const request = payload => new Request('http://localhost/api/dshOffice/snapshot', { method: 'POST', body: JSON.stringify(payload) });
  assert.equal((await route.fetch(request({}))).status, 400);
  const response = await route.fetch(request({ type: 'client-request', rpcId: '1', method: 'dshOffice/snapshot', payload: { sessionId: 'child' } }));
  const body = await response.json(); assert.equal(body.result.value.leadId, 'root');
  assert.equal(body.rpcId, '1'); assert.equal(body.type, 'server-response');
  ctx.cleanup(); assert.equal(disposed, true);
});
test('disposing an in-flight poll aborts the request and discards its late response', async () => {
  let resolve, signal, updates = 0;
  const stop = pollSnapshot(s => { signal = s; return new Promise(r => { resolve = r; }); }, () => updates++, () => updates++);
  stop(); resolve({}); await new Promise(r => setImmediate(r));
  assert.equal(signal.aborted, true); assert.equal(updates, 0);
});
