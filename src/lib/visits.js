// Which rooms have been opened during this visit, so their markers can show it. Kept in memory
// only: nothing is stored or sent.

const ROOMS = ['work', 'music', 'services', 'about', 'wall', 'resume'];
const seen = new Set();

export const visits = {
  has: (room) => seen.has(room),
  record(room) {
    if (ROOMS.includes(room)) seen.add(room);
  },
};
