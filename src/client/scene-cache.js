import { createActivityInbox } from './activities.js';
/** Keep each office's canvas and UI state alive for its native sidebar tab lifetime. */
export function createSceneCache(createScene, createHost = () => document.createElement('div')) {
  const records = new Map();
  function get(key) {
    if (records.has(key)) return records.get(key);
    let state = { snapshot: null, selected: null, sceneError: null, ready: false, view: 'team' };
    let host, scene, pending, owner, disposed = false;
    const inbox = createActivityInbox();
    let activities = [], resetActivities = false;
    const listeners = new Set(), signals = new Map();
    const publish = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
    const initialize = () => {
      if (pending || disposed) return;
      const attempt = {}; pending = attempt;
      createScene(host, id => publish({ selected: id }), error => {
        if (!disposed && pending === attempt) publish({ sceneError: error });
      }, { view: state.view })
        .then(value => {
          if (disposed || pending !== attempt) { value.destroy(); return; }
          scene = value; scene.setActive(!!owner?.visible); publish({ ready: true });
        }).catch(error => { if (!disposed && pending === attempt) publish({ sceneError: error }); });
    };
    const record = {
      key,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      getSnapshot() { return state; },
      select(id) { publish({ selected: id }); },
      cursor() { return inbox.cursor(); },
      snapshot(value) {
        const fresh = inbox.accept(value);
        if (value.reset || value.state !== 'live') { activities = []; resetActivities = true; }
        activities.push(...fresh); activities = activities.slice(-64);
        publish({ snapshot: value });
      },
      update(members, labels, activityLabel) {
        scene?.update(members, labels, state.selected);
        if (scene) {
          scene.activities?.(activities, { reset: resetActivities, label: activityLabel, tools: state.snapshot?.tools ?? {}, tasks: state.snapshot?.tasks ?? [] });
          activities = []; resetActivities = false;
        }
      },
      setView(view) {
        if (view === state.view || !['team', 'pixel'].includes(view)) return;
        scene?.destroy(); scene = null; pending = null;
        publish({ view, ready: false, sceneError: null }); if (host) initialize();
      },
      fit() { scene?.fit(); },
      focus(id) { scene?.focus(id); },
      mount(element, signal) {
        if (signal.aborted || disposed) return { visible() {}, detach() {} };
        if (!signals.has(signal)) {
          const release = () => { signals.delete(signal); if (!signals.size) record.dispose(); };
          signals.set(signal, release); signal.addEventListener('abort', release, { once: true });
        }
        host ??= createHost(); host.className = 'office-scene-host'; element.appendChild(host);
        const seat = { visible: false }; owner = seat;
        initialize();
        return {
          visible(value) { if (owner === seat) { seat.visible = value; scene?.setActive(value); } },
          detach() { if (owner === seat) { owner = null; scene?.setActive(false); host.remove(); } },
        };
      },
      retry() {
        scene?.destroy(); scene = null; pending = null;
        publish({ ready: false, sceneError: null }); initialize();
      },
      dispose() {
        if (disposed) return;
        disposed = true; scene?.destroy(); host?.remove();
        for (const [signal, listener] of signals) signal.removeEventListener('abort', listener);
        signals.clear(); listeners.clear(); records.delete(key);
      },
    };
    records.set(key, record);
    return record;
  }
  return { get, has: key => records.has(key), dispose() { for (const record of records.values()) record.dispose(); } };
}
