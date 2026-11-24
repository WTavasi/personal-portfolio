// Which rooms have been visited during this visit to the site. The audience fills as rooms are
// visited, and when all six have been seen the house is full and applauds (design document,
// section 6). Kept in memory only: nothing is stored or sent.

const ROOMS = ['work', 'music', 'services', 'about', 'wall', 'resume'];
const seen = new Set();
let full = false;

export const visits = {
  total: ROOMS.length,
  get size() {
    return seen.size;
  },
  get full() {
    return full;
  },
  has: (room) => seen.has(room),
  // Share of the audience seated: a few people are in from the start.
  share: () => 0.12 + (0.88 * seen.size) / ROOMS.length,
  // Note a visit; true only the moment the last room is seen.
  record(room) {
    if (!ROOMS.includes(room)) return false;
    seen.add(room);
    if (full || seen.size < ROOMS.length) return false;
    full = true;
    return true;
  },
};
