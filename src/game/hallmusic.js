// The quiet version of the theme that plays in the hall between movements. It uses the
// sections the visitor has unlocked so far, at the tempo they chose.
import { music } from '../lib/music.js';
import { getTempo } from '../lib/state.js';
import { hallLayers } from './movements.js';

export function playHallMusic() {
  const { bpm } = getTempo();
  if (music.playing && music.tag === 'hall') {
    music.setBpm(bpm);
    music.setLayers(hallLayers());
    return;
  }
  music.start({ tag: 'hall', bpm, layers: hallLayers(), level: 0.3 });
}
