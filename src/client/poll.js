/** Sequential polling with a bounded request and no writes after disposal. */
export function pollSnapshot(load, changed, failed, interval = 1500) {
  const controller = new AbortController();
  let timer;
  async function next() {
    try { const value = await load(controller.signal); if (!controller.signal.aborted) changed(value); }
    catch (error) { if (!controller.signal.aborted) failed(error); }
    if (!controller.signal.aborted) timer = setTimeout(next, interval);
  }
  void next();
  return () => { controller.abort(); clearTimeout(timer); };
}
