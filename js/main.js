import { App } from './app.js';
import { UI } from './ui.js';
import { registerCommands } from './commands.js';
import { registerMore } from './commands2.js';
import { Renderer } from './render.js';

const app = new App(document.body);
const ui = new UI(app);
window.webcad = app; window.webcadUI = ui; // depuração
try { const o = JSON.parse(localStorage.getItem('webcad.opts') || '{}'); Object.assign(app.settings, o); } catch { /* */ }
registerCommands(app, ui);
registerMore(app, ui);
ui.init();
app.mount();
Renderer.onImageLoad = () => { app.sceneDocDirty = true; app.redraw(); };
document.body.classList.toggle('lightbg', !app.isDark());
try { if (localStorage.getItem('webcad.side') !== '1') document.body.classList.add('noside'); if (localStorage.getItem('webcad.laypal') === '1') ui.layerPalette.show(); } catch { document.body.classList.add('noside'); }
setTimeout(() => app.resize(), 30);
app.view = { cx: 100, cy: 70, scale: Math.min(app.W / 240, app.H / 160) };
app.cOver.style.cursor = 'none';
app.cmdInput.focus();
setTimeout(() => ui.recover(true), 400);
