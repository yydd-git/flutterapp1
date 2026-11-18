/**
 * Persistent player settings in localStorage. Every access is wrapped in
 * try/catch: private mode or blocked storage must never break the game.
 */
const KEY = 'cgrr.settings.v1';

const DEFAULTS = {
  city: 'raipur',
  car: 'hatchback',
  colour: 0,
  steering: 'buttons', // 'buttons' | 'joystick' | 'tilt'
  camera: 'chase', // key of CAMERA.modes
  showTouch: 'auto', // 'auto' | 'on' | 'off'
  invertTilt: false,
  boundaries: 'walls', // 'walls' (stay near roads) | 'free' (drive anywhere)
  buildings: 'flat', // 'flat' (fast) | '3d' (extruded blocks)
  traffic: 'normal', // 'off' | 'normal' | 'busy'
  raceRoute: 'raipur-bhilai',
  raceVariant: 'sprint', // 'sprint' | 'full'
  raceLaps: 3,
  raceOpponents: 3,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}
