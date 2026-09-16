import { createOfficeScene as createPixelScene } from './scene.js';
import { createTeamOfficeScene } from './team-office/scene.js';

export function createOfficeScene(element, select, error, options = {}) {
  return options.view === 'pixel' ? createPixelScene(element, select, error)
    : createTeamOfficeScene(element, select, error);
}
