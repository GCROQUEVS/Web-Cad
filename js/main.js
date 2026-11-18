import { App } from './app.js';
import { UI } from './ui.js';
import { registerCommands } from './commands.js';

const app = new App(document.body);
const ui = new UI(app);
window.webcad = app; window.webcadUI = ui; // depuração
try { const o = JSON.parse(localStorage.getItem('webcad.opts') || '{}'); Object.assign(app.settings, o); } catch { /* */ }
registerCommands(app, ui);
ui.init();
app.mount();
document.body.classList.toggle('lightbg', !app.isDark());
app.view = { cx: 100, cy: 70, scale: Math.min(app.W / 240, app.H / 160) };
app.cOver.style.cursor = 'none';
app.cmdInput.focus();
setTimeout(() => ui.recover(true), 400);
