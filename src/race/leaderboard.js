/**
 * Best-time leaderboard per race board (route + length/laps), stored in
 * localStorage. Wrapped in try/catch: storage may be blocked.
 */
const KEY = 'cgrr.leaderboard.v1';
const MAX = 10;

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

/** Top entries for a board: [{ time, car, opponents, date }] fastest first. */
export function topTimes(board, n = 5) {
  return (readAll()[board] || []).slice(0, n);
}

/** Record a time; returns its 1-based rank (or 0 if it didn't make the board). */
export function addTime(board, entry) {
  const all = readAll();
  const list = all[board] || [];
  list.push({ ...entry, date: new Date().toISOString().slice(0, 10) });
  list.sort((a, b) => a.time - b.time);
  all[board] = list.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* not saved */ }
  const rank = all[board].findIndex((e) => e.time === entry.time && e.car === entry.car) + 1;
  return rank;
}

/** "1:23.45" */
export function formatTime(sec) {
  if (!isFinite(sec)) return '--:--.--';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}
