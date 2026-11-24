import { person } from '../content.js';
import { navigate } from '../lib/router.js';
import { getState, setState } from '../lib/state.js';
import { ensureAudio, preloadTuning, playTuning, stopTuning } from '../lib/audio.js';
import { homeMarkup } from './home-markup.js';

const saveData = () => !!navigator.connection?.saveData;
const later = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1500));

// The first screen. Everything important is readable at once over a still image of the hall.
// "Turn on the hall" is the one gesture that starts sound and the 3D: the audience talks and the
// orchestra tunes while the hall is built, then the lights come up and the still fades into the
// live hall. There is no music until the visitor chooses a piece. The 3D code and the audio download in the background while the page is idle (not
// on data-saver connections), but the hall is only built when asked for.
export function homeScreen({ world }) {
  const el = document.createElement('section');
  el.className = 'screen home';
  el.setAttribute('aria-label', 'Home');
  el.innerHTML = homeMarkup();

  const box = el.querySelector('[data-bind="hall"]');
  const button = el.querySelector('[data-act="turn-on"]');
  const status = el.querySelector('[data-bind="hall-status"]');
  let gone = false;

  function unavailable() {
    button.disabled = true;
    status.textContent = 'The 3D hall is not available on this device. Every room is in the Tracklist.';
  }

  async function turnOn() {
    if (button.disabled) return;
    button.disabled = true;
    // Turning on the hall turns on sound: that is what the button promises.
    if (!getState().sound) setState({ sound: true });
    ensureAudio();
    playTuning();

    let steps = 0;
    const onStep = (label) => {
      steps += 1;
      if (!gone) status.textContent = `${label}…`;
      button.textContent = `Building the hall (${Math.min(99, Math.round((steps / 9) * 100))}%)`;
    };
    try {
      await world.load(onStep);
    } catch (err) {
      console.warn('3D hall unavailable:', err);
      world.fallback = true;
    }
    if (world.fallback) {
      stopTuning(0.6);
      if (!gone) unavailable();
      return;
    }

    world.on = true;
    navigate('home'); // the same address, now showing the hall
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="turn-on"]')) turnOn();
  });

  return {
    el,
    title: `${person.name} | ${person.headline}`,
    mount() {
      box.hidden = false;
      if (world.fallback) unavailable();
      if (saveData()) return;
      later(() => {
        if (gone) return;
        world.prefetch();
        preloadTuning();
      });
    },
    destroy() {
      gone = true;
    },
  };
}
