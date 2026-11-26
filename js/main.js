import { App } from './app.js';
import { UI } from './ui.js';
import { registerCommands } from './commands.js';
import { registerMore } from './commands2.js';
import { registerLayout } from './commands3.js';
import { registerSolids } from './commands4.js';
import { GLView } from './view3d.js';
import { ViewCube } from './viewcube.js';
import { Renderer } from './render.js';
import { loadOptions, applyOptions } from './options.js';

const app = new App(document.body);
const ui = new UI(app);
window.webcad = app; window.webcadUI = ui; // depuração
loadOptions(app);
registerCommands(app, ui);
registerMore(app, ui);
registerLayout(app, ui);
registerSolids(app, ui);
ui.init();
app.mount();
const gl = new GLView(app); app.renderGL = () => gl.render();
const cube = new ViewCube(app, ui); app.onOverlay = () => { cube.draw(); ui.updateVpLabel(); };
app.onView3 = () => { ui.refreshStatus(); ui.refresh3d && ui.refresh3d(); };
window.webcadCube = cube;
Renderer.onImageLoad = () => { app.sceneDocDirty = true; app.redraw(); };
applyOptions(app, ui);
if (app.settings.showStart) setTimeout(() => ui.showStart(true), 100);
try { if (localStorage.getItem('webcad.side') !== '1') document.body.classList.add('noside'); if (localStorage.getItem('webcad.laypal') === '1') ui.layerPalette.show(); if (localStorage.getItem('webcad.aipanel') === '1') ui.assistant.show(); } catch { document.body.classList.add('noside'); }
setTimeout(() => app.resize(), 30);
Object.assign(app.view, { cx: 100, cy: 70, scale: Math.min(app.W / 240, app.H / 160) });
app.cOver.style.cursor = 'none';
app.cmdInput.focus();
setTimeout(() => ui.recover(true), 400);
