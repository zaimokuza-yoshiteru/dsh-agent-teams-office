import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneCache } from '../src/client/scene-cache.js';

function node() {
  return { parent: null, child: null,
    appendChild(child) { child.remove(); child.parent = this; this.child = child; },
    remove() { if (this.parent) this.parent.child = null; this.parent = null; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test('member navigation moves the same canvas and keeps selection, camera and snapshot until tabs close', async () => {
  let created = 0, destroyed = 0, onSelect;
  const focus = [], activity = [];
  const cache = createSceneCache(async (_host, select) => {
    created++; onSelect = select;
    return { destroy: () => destroyed++, setActive: value => activity.push(value), focus: id => focus.push(id) };
  }, node);
  const office = cache.get('team-office'), root = new AbortController(), child = new AbortController();
  const first = node(), second = node();
  const a = office.mount(first, root.signal); a.visible(true); await flush();
  const canvas = first.child;
  onSelect('member'); office.focus('member'); office.snapshot({ members: [{ id: 'member' }] });
  a.detach();
  const b = cache.get('team-office').mount(second, child.signal); b.visible(true); await flush();
  assert.equal(created, 1); assert.equal(destroyed, 0); assert.equal(second.child, canvas);
  assert.equal(office.getSnapshot().selected, 'member'); assert.equal(office.getSnapshot().snapshot.members[0].id, 'member');
  assert.deepEqual(focus, ['member']);
  a.detach(); assert.equal(second.child, canvas);
  b.visible(false); assert.equal(activity.at(-1), false);
  root.abort(); assert.equal(destroyed, 0);
  child.abort(); assert.equal(destroyed, 1); assert.equal(cache.has('team-office'), false);
  cache.dispose(); assert.equal(destroyed, 1);
});

test('closing the tab during asynchronous scene loading destroys the late result', async () => {
  let resolve, destroyed = 0;
  const cache = createSceneCache(() => new Promise(done => { resolve = done; }), node);
  const abort = new AbortController();
  cache.get('loading').mount(node(), abort.signal);
  abort.abort(); resolve({ destroy() { destroyed++; } }); await flush();
  assert.equal(destroyed, 1); assert.equal(cache.has('loading'), false);
});

test('switching renderers during loading releases the stale scene and retains the real snapshot', async () => {
  const pending = [], destroyed = [], active = [];
  const cache = createSceneCache((_host, _select, error, options) => new Promise(resolve => pending.push({ resolve, error, view: options.view })), node);
  const office = cache.get('sample'), abort = new AbortController();
  office.snapshot({ members: [{ id: 'real-member' }] }); office.select('real-member');
  office.mount(node(), abort.signal).visible(true);
  office.setView('pixel');
  assert.deepEqual(pending.map(p => p.view), ['team', 'pixel']);
  const value = view => ({ destroy() { destroyed.push(view); }, setActive(v) { active.push([view, v]); } });
  pending[1].resolve(value('pixel')); await flush();
  pending[0].error(new Error('late failure')); pending[0].resolve(value('team')); await flush();
  assert.deepEqual(destroyed, ['team']); assert.equal(office.getSnapshot().sceneError, null);
  assert.equal(office.getSnapshot().snapshot.members[0].id, 'real-member');
  assert.equal(office.getSnapshot().selected, 'real-member');
  office.setView('team');
  pending[2].resolve(value('new-team')); await flush();
  assert.deepEqual(active.at(-1), ['new-team', true]);
  abort.abort(); assert.deepEqual(destroyed, ['team', 'pixel', 'new-team']);
});
