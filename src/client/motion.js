/** Apply a real Teams status without restarting ongoing idle walks on each poll. */
export function syncMotion(character, status, previousMotion) {
  const motion = status === 'idle' || status === 'inactive' ? 'roam' : status === 'running' ? 'work' : 'wait';
  character.setStatusGlyph(status === 'failed' ? 'blocked' : 'none');
  character.setBaseAlpha(1);
  if (motion !== previousMotion) {
    if (motion === 'roam') character.startWandering(false);
    else character.sitAtDesk(motion === 'work');
  }
  return motion;
}
