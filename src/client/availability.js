/** No entry until the host confirms Agent Teams; loss of connectivity preserves existing UI. */
export function createOfficeAvailability(register, clear) {
  let unregister;
  return {
    update(snapshot) {
      if (snapshot.state !== 'disabled' && !unregister) unregister = register();
      if (snapshot.state === 'disabled' && unregister) { unregister(); unregister = null; clear(); }
    },
    dispose() { unregister?.(); unregister = null; },
  };
}
