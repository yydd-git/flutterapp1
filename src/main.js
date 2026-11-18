/**
 * Entry point: grabs the DOM nodes and starts the game.
 */
import './styles.css';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);

// iOS Safari: block pinch-zoom and double-tap zoom while playing.
document.addEventListener('gesturestart', (e) => e.preventDefault());

window.game = new Game({
  root: document.body,
  map: $('map'),
  overlay: $('overlay'),
  hud: $('hud'),
  touch: $('touch'),
  topbar: $('topbar'),
  menu: $('menu'),
  loading: $('loading'),
});
