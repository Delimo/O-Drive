import { createApiLayer } from './js/api/index.js';
import { createServices } from './js/services/index.js';
import { createStateSelectors } from './js/state/selectors.js';
import { createThunks } from './js/state/thunks.js';
import { createModalRenderers } from './js/render/modal.js';
import { createHomeRenderers } from './js/render/home.js';
import { createPageRenderers } from './js/render/pages.js';
import { createSharedRenderers } from './js/render/shared.js';
import { registerAppEvents } from './js/events/index.js';

const root = document.getElementById('app');
const page = document.body.dataset.page || 'home';

const icons = {
  cloud: '<img src="/favicon.svg" alt="" aria-hidden="true">',
  folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
  video: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 13 5 3V8l-5 3Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>',
  audio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>',
  text: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>',
  archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/><path d="M21 8H3l2-5h14Z"/><path d="M10 12h4"/></svg>',
  app: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12H2l3-8h14Z"/><path d="M2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6"/><circle cx="18" cy="16" r="1"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  stats: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18.25V13m5 5.25V8m5 10.25V11m4 7.25H3"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 5v5h-5m-6 9a7 7 0 1 1 5.4-11.47L20 10"/></svg>',
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V6m0 0 3.5 3.5M12 6 8.5 9.5M4 17.75A2.25 2.25 0 0 0 6.25 20h11.5A2.25 2.25 0 0 0 20 17.75"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10m0 0 3.5-3.5M12 14l-3.5-3.5M4 18.75A1.25 1.25 0 0 0 5.25 20h13.5A1.25 1.25 0 0 0 20 18.75"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.75 12 5.75 21.5 12 21.5 12 18 18.25 12 18.25 2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></svg>',
  logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5.75H6.75A1.75 1.75 0 0 0 5 7.5v9a1.75 1.75 0 0 0 1.75 1.75H10M14 8l4 4-4 4m4-4H9"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 1 1 10 0v2m-9 0h8.5A1.5 1.5 0 0 1 18 11.5v7A1.5 1.5 0 0 1 16.5 20h-9A1.5 1.5 0 0 1 6 18.5v-7A1.5 1.5 0 0 1 7.5 10Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4.75h6l.5 2H19v1.5h-1l-.62 10.04A1.75 1.75 0 0 1 15.63 20H8.37a1.75 1.75 0 0 1-1.75-1.71L6 8.25H5v-1.5h3.5l.5-2Zm.75 5.5v6.5m4.5-6.5v6.5"/></svg>',
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5h2.5M10 6.5h9M5 12h2.5M10 12h9M5 17.5h2.5M10 17.5h9"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9.75A1.75 1.75 0 0 1 10.75 8h8.5A1.75 1.75 0 0 1 21 9.75v9.5A1.75 1.75 0 0 1 19.25 21h-8.5A1.75 1.75 0 0 1 9 19.25v-9.5ZM4.75 3h8.5A1.75 1.75 0 0 1 15 4.75V6"/></svg>',
  move: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18m0-18 3 3m-3-3-3 3m3 15 3-3m-3 3-3-3M3 12h18m-18 0 3-3m-3 3 3 3m15-3-3-3m3 3-3 3"/></svg>',
  paste: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4.75h6M10 3h4a1 1 0 0 1 1 1v1H9V4a1 1 0 0 1 1-1Zm-3 3h10A1.75 1.75 0 0 1 18.75 8.5v10.75A1.75 1.75 0 0 1 17 21H7A1.75 1.75 0 0 1 5.25 19.25V8.5A1.75 1.75 0 0 1 7 6.75Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.2 17 19 7.5"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 13.5 13.5 10.5m-6.25 6.25 2.5-2.5a3 3 0 0 0 0-4.25 3 3 0 0 0-4.25 0L3 12.5a3 3 0 0 0 4.25 4.25Zm9.5-9.5-2.5 2.5a3 3 0 0 0 0 4.25 3 3 0 0 0 4.25 0L21 11.5a3 3 0 0 0-4.25-4.25Z"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 8a3 3 0 1 0-2.65-4.41M9 14l6-3m-6 0 6 3M9 10a3 3 0 1 0-2.65 4.41M15 16a3 3 0 1 0 2.65 4.41"/></svg>',
  restore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7v5h5M20 17a8 8 0 1 1-2.34-5.66L20 12"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-.8L19 8.4 15.6 5 4.8 15.8 4 20Zm8.8-13.8 3.4 3.4"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.75A1.75 1.75 0 0 1 6.75 3h8.38c.46 0 .9.18 1.22.5l2.15 2.15c.32.32.5.76.5 1.22v12.38A1.75 1.75 0 0 1 17.25 21H6.75A1.75 1.75 0 0 1 5 19.25V4.75Zm3 0v4.5h7v-3.5m-5 9h4"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 18 18M18 6 6 18"/></svg>',
};

const style = document.createElement('style');
style.textContent = `
  :root {
    color-scheme: light;
    --bg: #edf3f8;
    --bg-strong: #dfeaf3;
    --panel: rgba(255, 255, 255, 0.78);
    --panel-strong: rgba(255, 255, 255, 0.92);
    --line: rgba(65, 85, 109, 0.14);
    --line-strong: rgba(45, 64, 87, 0.22);
    --text: #102033;
    --muted: #617387;
    --accent: #0e7490;
    --accent-strong: #0f4c5c;
    --accent-soft: rgba(14, 116, 144, 0.12);
    --success: #18794e;
    --warning: #b76e11;
    --danger: #c0392b;
    --shadow: 0 26px 70px rgba(24, 53, 79, 0.14);
    --radius-xl: 28px;
    --radius-lg: 22px;
    --radius-md: 16px;
    --radius-sm: 12px;
    --display-font: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", "Songti SC", serif;
    --body-font: "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    min-height: 100%;
  }

  body {
    min-height: 100vh;
    font-family: var(--body-font);
    color: var(--text);
    background:
      radial-gradient(circle at 14% 18%, rgba(127, 206, 240, 0.34), transparent 24%),
      radial-gradient(circle at 88% 8%, rgba(255, 255, 255, 0.92), transparent 18%),
      radial-gradient(circle at 82% 78%, rgba(170, 217, 236, 0.5), transparent 22%),
      linear-gradient(135deg, #edf5fb 0%, #eaf0f4 43%, #dbe7f0 100%);
    overflow: hidden;
  }

  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(90deg, rgba(255,255,255,0.16) 1px, transparent 1px),
      linear-gradient(rgba(255,255,255,0.16) 1px, transparent 1px);
    background-size: 36px 36px;
    mask-image: linear-gradient(to bottom, rgba(0,0,0,0.3), transparent 85%);
    opacity: 0.28;
  }

  button,
  input,
  select {
    font: inherit;
  }

  button {
    cursor: pointer;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  img,
  video,
  iframe {
    max-width: 100%;
  }

  .app-shell {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    padding: 18px;
  }

  .app-shell::after {
    content: "";
    position: fixed;
    width: min(38vw, 360px);
    aspect-ratio: 1;
    right: -8vw;
    bottom: -10vw;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(12, 148, 181, 0.18), transparent 70%);
    filter: blur(6px);
    pointer-events: none;
  }

  .workspace {
    width: min(1480px, 100%);
    margin: 0 auto;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .glass-card {
    background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.76));
    border: 1px solid var(--line);
    box-shadow: var(--shadow);
    backdrop-filter: blur(18px);
  }

  .topbar,
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-radius: var(--radius-xl);
    padding: 16px 18px;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .brand-badge {
    width: 40px;
    height: 28px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
  }

  .brand-badge img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .brand-badge svg,
  .icon svg {
    width: 100%;
    height: 100%;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .brand-name {
    margin: 0;
    font-family: var(--body-font);
    font-size: clamp(22px, 2vw, 26px);
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.03em;
  }

  .brand-meta {
    display: none;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .search-box {
    position: relative;
    width: min(404px, 100%);
    min-width: 280px;
  }

  .search-box input,
  .inline-input,
  .inline-select {
    width: 100%;
    border: 1px solid rgba(68, 98, 122, 0.16);
    background: rgba(250, 253, 255, 0.92);
    color: var(--text);
    outline: none;
    transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
  }

  .search-box input:focus,
  .inline-input:focus,
  .inline-select:focus {
    border-color: rgba(14, 116, 144, 0.4);
    box-shadow: 0 0 0 4px rgba(14, 116, 144, 0.08);
  }

  .search-box input {
    min-height: 56px;
    border-radius: 18px;
    border-color: rgba(201, 214, 231, 0.9);
    background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(249,250,252,0.98));
    padding: 15px 20px 15px 44px;
    font-size: 16px;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.92);
  }

  .search-icon {
    position: absolute;
    inset: 0 auto 0 15px;
    width: 17px;
    height: 17px;
    margin: auto 0;
    color: var(--muted);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .header-btn {
    min-width: 102px;
    min-height: 54px;
    padding: 0 28px;
    border-radius: 18px;
    border-color: rgba(201, 214, 231, 0.92);
    background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,252,0.98));
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.94);
    font-size: 16px;
    font-weight: 600;
  }

  .header-btn:hover {
    border-color: rgba(182, 199, 222, 1);
    background: linear-gradient(180deg, rgba(255,255,255,1), rgba(244,247,251,1));
    transform: translateY(-1px);
  }

  .btn-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 16px;
    border: 1px solid rgba(45, 64, 87, 0.14);
    background: rgba(255,255,255,0.88);
    color: var(--text);
    transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.45);
  }

  .btn:hover {
    transform: translateY(-1px);
    border-color: rgba(15, 76, 92, 0.3);
    background: rgba(255,255,255,0.96);
  }

  .btn-primary {
    color: white;
    border-color: transparent;
    background: linear-gradient(135deg, #0e7e9d 0%, #124657 100%);
    box-shadow: 0 14px 30px rgba(14, 116, 144, 0.22);
  }

  .btn-primary:hover {
    background: linear-gradient(135deg, #0c7190 0%, #103e4d 100%);
  }

  .btn-ghost {
    background: rgba(14, 116, 144, 0.08);
    color: var(--accent-strong);
    border-color: rgba(14, 116, 144, 0.12);
  }

  .btn-muted {
    color: var(--muted);
  }

  .btn-danger {
    color: var(--danger);
    background: rgba(192, 57, 43, 0.06);
    border-color: rgba(192, 57, 43, 0.12);
  }

  .btn-small {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 12px;
    font-size: 13px;
  }

  .icon {
    width: 18px;
    height: 18px;
    display: inline-flex;
  }

  .toolbar-left,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .crumbs {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 0;
    background: transparent;
    border: 0;
  }

  .crumb {
    min-height: 54px;
    padding: 0 24px;
    border-radius: 18px;
    color: var(--text);
    border: 1px solid rgba(201, 214, 231, 0.92);
    background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,252,0.98));
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.94);
    font-size: 16px;
    font-weight: 600;
  }

  .crumb.is-current {
    color: #0f172a;
    font-weight: 700;
  }

  .toolbar-legacy {
    padding: 12px 14px;
  }

  .toolbar-actions-legacy {
    gap: 12px;
  }

  .toolbar-btn {
    min-width: 102px;
    min-height: 54px;
    padding: 0 24px;
    border-radius: 18px;
    border-color: rgba(201, 214, 231, 0.92);
    background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,252,0.98));
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.94);
    font-size: 16px;
    font-weight: 600;
  }

  .toolbar-btn-active {
    border-color: rgba(188, 205, 229, 1);
    background: linear-gradient(180deg, rgba(245,248,252,1), rgba(240,245,250,1));
  }

  .toolbar-select {
    min-width: 102px;
    min-height: 54px;
    width: 102px;
    padding: 0 18px;
    border-radius: 18px;
    border-color: rgba(201, 214, 231, 0.92);
    background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,252,0.98));
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.94);
    color: var(--text);
    font-size: 16px;
    font-weight: 600;
    appearance: none;
    text-align: center;
    text-align-last: center;
  }

  .toolbar-tag {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    background: rgba(14, 116, 144, 0.08);
    color: var(--accent-strong);
    font-size: 13px;
    font-weight: 700;
  }

  .surface {
    position: relative;
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 16px;
  }

  .surface-legacy {
    display: block;
  }

  .explorer,
  .inspector,
  .admin-board,
  .share-board,
  .auth-board {
    border-radius: var(--radius-xl);
    min-height: 0;
  }

  .explorer,
  .admin-board,
  .share-board,
  .auth-board {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .explorer-legacy {
    min-height: calc(100vh - 280px);
  }

  .panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 22px 24px 12px;
  }

  .panel-title {
    margin: 0;
    font-family: var(--display-font);
    font-size: clamp(24px, 2.5vw, 36px);
    line-height: 1;
  }

  .panel-copy {
    margin: 10px 0 0;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.65;
  }

  .panel-body {
    flex: 1;
    min-height: 0;
    padding: 0 24px 24px;
    overflow: auto;
  }

  .hero-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 18px;
  }

  .mini-stat {
    padding: 16px 18px;
    border-radius: 20px;
    background: linear-gradient(160deg, rgba(255,255,255,0.88), rgba(241,248,251,0.75));
    border: 1px solid rgba(61, 90, 117, 0.12);
  }

  .mini-stat-label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--muted);
  }

  .mini-stat-value {
    margin-top: 12px;
    font-size: clamp(22px, 2vw, 30px);
    font-family: var(--display-font);
  }

  .mini-stat-meta {
    margin-top: 8px;
    font-size: 13px;
    color: var(--muted);
  }

  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
    padding: 14px 18px;
    border-radius: 18px;
    background: rgba(248, 252, 255, 0.86);
    border: 1px solid rgba(61, 90, 117, 0.12);
  }

  .status-main {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    color: var(--muted);
    font-size: 14px;
  }

  .status-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: linear-gradient(135deg, #18a999, #0f766e);
    box-shadow: 0 0 0 4px rgba(24, 169, 153, 0.16);
  }

  .file-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
  }

  .explorer-legacy .panel-body {
    padding-top: 8px;
  }

  .file-grid.is-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .item-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
    border-radius: 24px;
    background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(245,250,252,0.78));
    border: 1px solid rgba(61, 90, 117, 0.12);
    transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
    cursor: pointer;
    overflow: hidden;
  }

  .item-pick {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 2;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    border: 1px solid rgba(61, 90, 117, 0.14);
    background: rgba(255,255,255,0.94);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
  }

  .item-pick.is-active {
    color: white;
    background: linear-gradient(135deg, #0e7e9d 0%, #124657 100%);
    border-color: transparent;
  }

  .item-card:hover {
    transform: translateY(-3px);
    border-color: rgba(14, 116, 144, 0.22);
    box-shadow: 0 22px 34px rgba(32, 71, 93, 0.12);
  }

  .item-card.is-selected {
    border-color: rgba(14, 116, 144, 0.42);
    box-shadow: 0 22px 36px rgba(14, 116, 144, 0.16);
    background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(231,245,249,0.88));
  }

  .item-card-legacy {
    min-height: 120px;
    justify-content: center;
  }

  .item-card::after {
    content: "";
    position: absolute;
    inset: auto -38px -40px auto;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(14, 116, 144, 0.08), transparent 70%);
    pointer-events: none;
  }

  .file-grid.is-list .item-card {
    flex-direction: row;
    align-items: center;
    gap: 18px;
    padding: 16px 18px;
    border-radius: 20px;
  }

  .item-icon {
    width: 58px;
    height: 58px;
    flex: none;
    border-radius: 20px;
    display: grid;
    place-items: center;
    color: white;
    background: linear-gradient(135deg, #57bdd8 0%, #0e5f79 100%);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.32);
  }

  .item-icon.folder {
    background: linear-gradient(135deg, #f6c768 0%, #b77412 100%);
  }

  .item-icon.pdf {
    background: linear-gradient(135deg, #ff8575 0%, #bf3a2d 100%);
  }

  .item-icon.image {
    background: linear-gradient(135deg, #7ed0d4 0%, #1a7c78 100%);
  }

  .item-icon.video {
    background: linear-gradient(135deg, #93a0ff 0%, #3d4fb5 100%);
  }

  .item-icon.audio {
    background: linear-gradient(135deg, #dda7ff 0%, #7a43b5 100%);
  }

  .item-icon.archive {
    background: linear-gradient(135deg, #8ab692 0%, #48754f 100%);
  }

  .item-icon svg {
    width: 28px;
    height: 28px;
  }

  .item-content {
    min-width: 0;
    flex: 1;
  }

  .item-title {
    margin: 0;
    font-size: 15px;
    line-height: 1.45;
    word-break: break-word;
  }

  .item-meta {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    color: var(--muted);
    font-size: 12px;
  }

  .item-chip {
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(16, 32, 51, 0.06);
  }

  .details-drawer-wrap {
    position: fixed;
    inset: 0;
    z-index: 26;
    pointer-events: none;
  }

  .details-drawer-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(10, 22, 34, 0.08);
    opacity: 0;
    transition: opacity 180ms ease;
  }

  .details-drawer {
    position: absolute;
    top: 18px;
    right: 18px;
    bottom: 18px;
    width: min(360px, calc(100vw - 36px));
    border-radius: 28px;
    background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,252,0.96));
    border: 1px solid rgba(201, 214, 231, 0.92);
    box-shadow: 0 26px 70px rgba(24, 53, 79, 0.14);
    transform: translateX(calc(100% + 24px));
    transition: transform 220ms ease;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .details-drawer.is-open {
    transform: translateX(0);
  }

  .details-drawer-wrap.is-open {
    pointer-events: auto;
  }

  .details-drawer-wrap.is-open .details-drawer-backdrop {
    opacity: 1;
  }

  .details-drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 22px 22px 14px;
    border-bottom: 1px solid rgba(201, 214, 231, 0.7);
  }

  .details-drawer-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 20px 22px 22px;
  }

  .details-close {
    width: 38px;
    height: 38px;
    border-radius: 14px;
    border: 1px solid rgba(201, 214, 231, 0.92);
    background: rgba(255,255,255,0.96);
    color: var(--text);
  }

  .details-panel-shell,
  .details-panel-empty {
    display: grid;
    gap: 16px;
  }

  .details-panel-title {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    line-height: 1.2;
  }

  .details-panel-copy {
    margin: 6px 0 0;
    color: var(--muted);
    line-height: 1.7;
    font-size: 14px;
    word-break: break-all;
  }

  .details-panel-grid {
    display: grid;
    gap: 12px;
  }

  .details-kv {
    padding: 16px 18px;
    border-radius: 20px;
    background: rgba(250, 252, 254, 0.9);
    border: 1px solid rgba(201, 214, 231, 0.72);
  }

  .details-k {
    font-size: 12px;
    color: var(--muted);
    letter-spacing: 0.08em;
  }

  .details-v {
    margin-top: 8px;
    font-size: 14px;
    line-height: 1.7;
    word-break: break-all;
  }

  .details-panel-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .item-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .batch-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 16px;
    padding: 14px 16px;
    border-radius: 18px;
    background: rgba(14, 116, 144, 0.08);
    border: 1px solid rgba(14, 116, 144, 0.12);
  }

  .preview-modal {
    width: min(1080px, 100%);
    max-height: min(88vh, 980px);
    display: flex;
    flex-direction: column;
  }

  .preview-modal-body {
    min-height: 0;
    flex: 1;
    overflow: auto;
    border-radius: 20px;
    background: rgba(248, 252, 255, 0.92);
    border: 1px solid rgba(61, 90, 117, 0.12);
  }

  .preview-media-shell {
    min-height: min(72vh, 760px);
    display: grid;
    place-items: center;
    padding: 18px;
  }

  .preview-media-shell img,
  .preview-media-shell video,
  .preview-media-shell iframe {
    width: 100%;
    max-height: min(72vh, 760px);
    border: 0;
    object-fit: contain;
    background: white;
    border-radius: 18px;
  }

  .preview-text {
    margin: 0;
    padding: 22px;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.75;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 13px;
  }

  .preview-editor {
    width: 100%;
    min-height: min(70vh, 720px);
    border: 0;
    outline: none;
    resize: vertical;
    background: transparent;
    padding: 22px;
    line-height: 1.7;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 13px;
  }

  .form-grid {
    display: grid;
    gap: 12px;
  }

  .check-row {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text);
  }

  .check-row input {
    width: 18px;
    height: 18px;
  }

  .inspector {
    padding: 20px;
  }

  .inspector-wrap {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 18px;
  }

  .inspector-title {
    margin: 0;
    font-family: var(--display-font);
    font-size: 28px;
  }

  .inspector-copy {
    margin: 8px 0 0;
    color: var(--muted);
    line-height: 1.7;
    font-size: 14px;
  }

  .detail-card {
    padding: 18px;
    border-radius: 22px;
    background: rgba(250, 252, 254, 0.86);
    border: 1px solid rgba(61, 90, 117, 0.12);
  }

  .detail-key {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--muted);
  }

  .detail-value {
    margin-top: 10px;
    font-size: 14px;
    line-height: 1.7;
    word-break: break-all;
  }

  .detail-list {
    display: grid;
    gap: 14px;
  }

  .empty-state {
    display: grid;
    place-items: center;
    min-height: 280px;
    padding: 36px 20px;
    text-align: center;
  }

  .empty-orb {
    width: 92px;
    height: 92px;
    margin: 0 auto 20px;
    border-radius: 32px;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, rgba(14,116,144,0.14), rgba(14,116,144,0.05));
    color: var(--accent);
  }

  .empty-orb svg {
    width: 44px;
    height: 44px;
  }

  .empty-title {
    margin: 0;
    font-family: var(--display-font);
    font-size: 30px;
  }

  .empty-copy {
    margin: 12px auto 0;
    max-width: 500px;
    color: var(--muted);
    line-height: 1.8;
  }

  .admin-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 16px;
  }

  .admin-frame {
    display: grid;
    gap: 16px;
  }

  .admin-strip,
  .admin-content {
    border-radius: 28px;
    background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,252,0.96));
    border: 1px solid rgba(201, 214, 231, 0.92);
    box-shadow: 0 26px 70px rgba(24, 53, 79, 0.1);
  }

  .admin-strip {
    min-height: 84px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
  }

  .admin-content {
    min-height: calc(100vh - 340px);
    padding: 20px;
  }

  .admin-board {
    background: transparent;
    border: 0;
    box-shadow: none;
  }

  .admin-card {
    padding: 20px;
    border-radius: 24px;
    background: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(243,248,251,0.82));
    border: 1px solid rgba(61, 90, 117, 0.12);
  }

  .admin-card.span-4 {
    grid-column: span 4;
  }

  .admin-card.span-6 {
    grid-column: span 6;
  }

  .admin-card.span-8 {
    grid-column: span 8;
  }

  .admin-card.span-12 {
    grid-column: span 12;
  }

  .admin-label {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.18em;
  }

  .admin-value {
    margin-top: 14px;
    font-size: clamp(28px, 2.4vw, 42px);
    font-family: var(--display-font);
  }

  .admin-copy {
    margin-top: 10px;
    color: var(--muted);
    line-height: 1.7;
    font-size: 14px;
  }

  .bars {
    display: grid;
    gap: 12px;
    margin-top: 16px;
  }

  .bar-row {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    font-size: 13px;
  }

  .bar-track {
    height: 10px;
    border-radius: 999px;
    background: rgba(16, 32, 51, 0.08);
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(135deg, #60c4d0, #0e6f8a);
  }

  .attention-list,
  .latest-list {
    display: grid;
    gap: 12px;
    margin-top: 16px;
  }

  .attention-item,
  .latest-item {
    padding: 16px 18px;
    border-radius: 18px;
    background: rgba(250, 252, 254, 0.85);
    border: 1px solid rgba(61, 90, 117, 0.12);
  }

  .attention-item[data-level="warning"] {
    background: rgba(183, 110, 17, 0.08);
    border-color: rgba(183, 110, 17, 0.16);
  }

  .attention-item[data-level="ok"] {
    background: rgba(24, 121, 78, 0.08);
    border-color: rgba(24, 121, 78, 0.16);
  }

  .attention-title,
  .latest-title {
    margin: 0;
    font-size: 15px;
  }

  .attention-copy,
  .latest-copy {
    margin-top: 8px;
    color: var(--muted);
    line-height: 1.7;
    font-size: 13px;
  }

  .share-board {
    display: grid;
    grid-template-columns: minmax(0, 380px) minmax(0, 1fr);
  }

  .share-side {
    padding: 28px;
    border-right: 1px solid rgba(61, 90, 117, 0.12);
    background: linear-gradient(160deg, rgba(18, 70, 87, 0.96), rgba(14, 126, 157, 0.82));
    color: white;
  }

  .share-side .panel-title,
  .share-side .panel-copy,
  .share-side .toolbar-tag {
    color: inherit;
  }

  .share-side .toolbar-tag {
    background: rgba(255,255,255,0.14);
  }

  .share-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding: 28px;
    gap: 18px;
  }

  .preview-stage {
    flex: 1;
    min-height: 320px;
    border-radius: 24px;
    overflow: hidden;
    background: rgba(242, 248, 251, 0.88);
    border: 1px solid rgba(61, 90, 117, 0.12);
  }

  .preview-stage img,
  .preview-stage video,
  .preview-stage iframe {
    width: 100%;
    height: 100%;
    border: 0;
    object-fit: contain;
    background: white;
  }

  .stack {
    display: grid;
    gap: 14px;
  }

  .modal-wrap,
  .toast-wrap {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 30;
  }

  .modal-wrap {
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(12, 23, 36, 0.22);
    backdrop-filter: blur(8px);
    pointer-events: auto;
  }

  .modal-card {
    width: min(460px, 100%);
    padding: 28px;
    border-radius: 28px;
    background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,248,251,0.92));
    border: 1px solid rgba(61, 90, 117, 0.14);
    box-shadow: 0 30px 70px rgba(9, 24, 38, 0.24);
  }

  .modal-title {
    margin: 0;
    font-family: var(--display-font);
    font-size: 30px;
  }

  .modal-copy {
    margin-top: 10px;
    color: var(--muted);
    line-height: 1.75;
  }

  .modal-form {
    margin-top: 18px;
    display: grid;
    gap: 12px;
  }

  .inline-input,
  .inline-select {
    min-height: 48px;
    padding: 0 16px;
    border-radius: 16px;
  }

  .helper-text {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.7;
  }

  .error-text {
    color: var(--danger);
    font-size: 13px;
    line-height: 1.7;
  }

  .toast-wrap {
    display: grid;
    place-items: end center;
    padding: 24px;
  }

  .toast {
    pointer-events: auto;
    min-width: 280px;
    max-width: min(520px, calc(100vw - 32px));
    padding: 16px 18px;
    border-radius: 18px;
    color: white;
    background: rgba(16, 32, 51, 0.92);
    box-shadow: 0 24px 52px rgba(16, 32, 51, 0.28);
  }

  .toast[data-type="success"] {
    background: rgba(24, 121, 78, 0.96);
  }

  .toast[data-type="error"] {
    background: rgba(192, 57, 43, 0.96);
  }

  .muted {
    color: var(--muted);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 1200px) {
    .surface,
    .share-board {
      grid-template-columns: 1fr;
    }

    .share-side {
      border-right: 0;
      border-bottom: 1px solid rgba(255,255,255,0.16);
    }
  }

  @media (max-width: 980px) {
    body {
      overflow: auto;
    }

    .app-shell {
      min-height: auto;
      padding: 14px;
    }

    .workspace {
      min-height: auto;
    }

    .topbar,
    .toolbar {
      align-items: flex-start;
      flex-direction: column;
    }

    .header-right,
    .toolbar-right {
      width: 100%;
      justify-content: flex-start;
    }

    .header-actions {
      width: 100%;
    }

    .search-box {
      width: 100%;
      min-width: 0;
    }

    .panel-header {
      padding: 20px 20px 10px;
    }

    .panel-body {
      padding: 0 20px 20px;
    }

    .hero-strip {
      grid-template-columns: 1fr;
    }

    .admin-card.span-4,
    .admin-card.span-6,
    .admin-card.span-8,
    .admin-card.span-12 {
      grid-column: span 12;
    }
  }

  @media (max-width: 720px) {
    .brand-name {
      font-size: 22px;
    }

    .btn {
      width: 100%;
      justify-content: center;
    }

    .header-actions .btn,
    .header-actions a.btn {
      width: auto;
      flex: 1 1 0;
    }

    .btn-row,
    .toolbar-left,
    .toolbar-right {
      width: 100%;
    }

    .crumbs,
    .status-bar {
      width: 100%;
    }

    .file-grid {
      grid-template-columns: 1fr;
    }

    .file-grid.is-list .item-card {
      align-items: flex-start;
      flex-direction: column;
    }
  }
`;
document.head.appendChild(style);

const initialState = {
  app: {
    page,
    role: 'guest',
    csrf: '',
    booting: true,
    toast: null,
    modal: null,
    now: Date.now(),
  },
  explorer: {
    path: getInitialPath(),
    storageId: 'r2',
    loading: false,
    query: getInitialSearch(),
    queryDraft: getInitialSearch(),
    view: 'grid',
    sort: 'smart',
    filter: 'all',
    folders: [],
    files: [],
    trashItems: [],
    trashMode: false,
    selectedKey: '',
    selectedKeys: [],
    clipboard: null,
    error: '',
  },
  admin: {
    loading: false,
    stats: null,
    shares: [],
    sharesLoading: false,
    sharesError: '',
    shareBusyToken: '',
    error: '',
  },
  share: {
    token: getShareToken(),
    loading: false,
    item: null,
    error: '',
    requiresPassword: false,
    password: '',
  },
};

function createSlice({ name, initialState: sliceState, reducers }) {
  const actionCreators = {};
  const caseMap = {};

  Object.entries(reducers).forEach(([key, reducer]) => {
    const type = `${name}/${key}`;
    caseMap[type] = reducer;
    actionCreators[key] = payload => ({ type, payload });
  });

  const reducer = (state = sliceState, action) => {
    const current = caseMap[action.type];
    return current ? current(state, action) : state;
  };

  return { actions: actionCreators, reducer };
}

function combineReducers(reducers) {
  return (state, action) => {
    const next = {};
    for (const [key, reducer] of Object.entries(reducers)) {
      next[key] = reducer(state[key], action);
    }
    return next;
  };
}

function createStore(reducer, state) {
  let currentState = state;
  const listeners = new Set();

  return {
    getState() {
      return currentState;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(action) {
      if (typeof action === 'function') {
        return action(this.dispatch.bind(this), this.getState.bind(this));
      }
      currentState = reducer(currentState, action);
      listeners.forEach(listener => listener());
      return action;
    },
  };
}

const appSlice = createSlice({
  name: 'app',
  initialState: initialState.app,
  reducers: {
    setBooting(state, action) {
      return { ...state, booting: action.payload };
    },
    setRole(state, action) {
      return { ...state, role: action.payload.role, csrf: action.payload.csrf || '' };
    },
    setToast(state, action) {
      return { ...state, toast: action.payload };
    },
    clearToast(state) {
      return { ...state, toast: null };
    },
    setModal(state, action) {
      return { ...state, modal: action.payload };
    },
    setNow(state, action) {
      return { ...state, now: action.payload };
    },
  },
});

const explorerSlice = createSlice({
  name: 'explorer',
  initialState: initialState.explorer,
  reducers: {
    setLoading(state, action) {
      return { ...state, loading: action.payload };
    },
    setPath(state, action) {
      return { ...state, path: action.payload };
    },
    setQueryDraft(state, action) {
      return { ...state, queryDraft: action.payload };
    },
    setQuery(state, action) {
      return { ...state, query: action.payload };
    },
    setView(state, action) {
      return { ...state, view: action.payload };
    },
    setSort(state, action) {
      return { ...state, sort: action.payload };
    },
    setFilter(state, action) {
      return { ...state, filter: action.payload };
    },
    setSelection(state, action) {
      return { ...state, selectedKey: action.payload };
    },
    setSelectedKeys(state, action) {
      return { ...state, selectedKeys: action.payload };
    },
    setClipboard(state, action) {
      return { ...state, clipboard: action.payload };
    },
    setTrashMode(state, action) {
      return { ...state, trashMode: action.payload };
    },
    setData(state, action) {
      return {
        ...state,
        loading: false,
        error: '',
        folders: action.payload.folders || [],
        files: action.payload.files || [],
        trashItems: action.payload.trashItems || [],
        storageId: action.payload.storageId || state.storageId,
        selectedKeys: [],
      };
    },
    setError(state, action) {
      return { ...state, loading: false, error: action.payload };
    },
  },
});

const adminSlice = createSlice({
  name: 'admin',
  initialState: initialState.admin,
  reducers: {
    setLoading(state, action) {
      return { ...state, loading: action.payload };
    },
    setStats(state, action) {
      return { ...state, loading: false, error: '', stats: action.payload };
    },
    setSharesLoading(state, action) {
      return { ...state, sharesLoading: action.payload };
    },
    setShares(state, action) {
      return { ...state, sharesLoading: false, sharesError: '', shares: action.payload || [] };
    },
    setSharesError(state, action) {
      return { ...state, sharesLoading: false, sharesError: action.payload, shares: [] };
    },
    setShareBusyToken(state, action) {
      return { ...state, shareBusyToken: action.payload || '' };
    },
    setError(state, action) {
      return { ...state, loading: false, error: action.payload };
    },
  },
});

const shareSlice = createSlice({
  name: 'share',
  initialState: initialState.share,
  reducers: {
    setLoading(state, action) {
      return { ...state, loading: action.payload };
    },
    setToken(state, action) {
      return { ...state, token: action.payload };
    },
    setPassword(state, action) {
      return { ...state, password: action.payload };
    },
    setData(state, action) {
      return { ...state, loading: false, item: action.payload, error: '', requiresPassword: false };
    },
    setPasswordRequired(state, action) {
      return { ...state, loading: false, requiresPassword: true, error: action.payload || '' };
    },
    setError(state, action) {
      return { ...state, loading: false, error: action.payload, item: null };
    },
  },
});

const actions = {
  app: appSlice.actions,
  explorer: explorerSlice.actions,
  admin: adminSlice.actions,
  share: shareSlice.actions,
};

const store = createStore(
  combineReducers({
    app: appSlice.reducer,
    explorer: explorerSlice.reducer,
    admin: adminSlice.reducer,
    share: shareSlice.reducer,
  }),
  initialState,
);

let searchTimer = null;
let toastTimer = null;

function dispatchToast(type, message) {
  if (!message) return;
  store.dispatch(actions.app.setToast({ type, message }));
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    store.dispatch(actions.app.clearToast());
  }, 2600);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getInitialPath() {
  const value = new URLSearchParams(window.location.search).get('path') || '';
  return normalizeKey(value);
}

function getInitialSearch() {
  return new URLSearchParams(window.location.search).get('q') || '';
}

function getShareToken() {
  const url = new URL(window.location.href);
  return url.searchParams.get('token') || url.searchParams.get('share') || '';
}

function normalizeKey(value = '') {
  return String(value || '').replace(/^\/+|\/+$/g, '');
}

function encodeRouteKey(value = '') {
  return normalizeKey(value)
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const scaled = size / (1024 ** index);
  return `${scaled >= 100 || index === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[index]}`;
}

function formatTimeLegacy(value) {
  const time = Number(value || 0);
  if (!time) return '未知时间';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
}

function formatRelativeLegacy(value) {
  const time = Number(value || 0);
  if (!time) return '刚刚';
  const diff = Date.now() - time;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.max(1, Math.round(diff / minute))} 分钟前`;
  if (diff < day) return `${Math.max(1, Math.round(diff / hour))} 小时前`;
  return `${Math.max(1, Math.round(diff / day))} 天前`;
}

function inferKind(item) {
  if (item.kind === 'folder' || item.virtual) return 'folder';
  const key = (item.fullKey || item.path || item.name || '').toLowerCase();
  if (/\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/.test(key)) return 'image';
  if (/\.(mp4|mov|webm|mkv|avi|m4v)$/.test(key)) return 'video';
  if (/\.(mp3|wav|aac|flac|ogg|m4a)$/.test(key)) return 'audio';
  if (/\.pdf$/.test(key)) return 'pdf';
  if (/\.(zip|rar|7z|tar|gz|tgz)$/.test(key)) return 'archive';
  if (/\.(js|ts|tsx|jsx|json|md|txt|csv|html|css|xml|yml|yaml)$/.test(key)) return 'text';
  if (/\.(exe|msi|dmg|apk|ipa)$/.test(key)) return 'app';
  return 'file';
}

function iconForKind(kind) {
  return icons[kind] || icons.file;
}

function iconClass(kind) {
  if (['folder', 'image', 'video', 'audio', 'pdf', 'archive'].includes(kind)) return kind;
  return 'file';
}

async function copyTextLegacy(value, successText = '已复制') {
  try {
    await navigator.clipboard.writeText(value);
    dispatchToast('success', successText);
    return true;
  } catch (_) {
    dispatchToast('error', '复制失败');
    return false;
  }
}

async function ensureRemoteDirectoryTree(path) {
  const normalized = normalizeKey(path);
  if (!normalized) return;
  const parts = normalized.split('/').filter(Boolean);
  let current = '';
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const parent = current;
    current = current ? `${current}/${part}` : part;
    const existing = findCurrentEntryByPath(current);
    if (existing && inferKind(existing) === 'folder') continue;
    const { response, data } = await fileApi.createFolder(parent, part, 'r2');
    if (!response.ok && !/already exists/i.test(data?.message || '')) {
      throw new Error(humanError(response, data, `创建目录 ${current} 失败`));
    }
  }
}

function humanErrorLegacy(response, data, fallback) {
  const raw = data?.failed?.[0]?.message || data?.message || '';
  if (response?.status === 401) return '登录状态已失效，请重新登录。';
  if (response?.status === 403) {
    if (/csrf/i.test(raw)) return '安全校验已过期，请刷新页面后重试。';
    return '当前没有权限执行这个操作。';
  }
  if (response?.status === 409) return '目标位置存在同名项目，请更换名称后重试。';
  return raw || fallback;
}

function splitUploadTarget(file, basePath) {
  const relative = String(file.webkitRelativePath || '');
  const relativeParts = relative.split('/').filter(Boolean);
  const targetName = relativeParts.length ? relativeParts[relativeParts.length - 1] : file.name;
  const relativeDir = relativeParts.length > 1 ? relativeParts.slice(0, -1).join('/') : '';
  const targetDir = [basePath, relativeDir].filter(Boolean).join('/');
  return { targetName, targetDir, relativeDir };
}

function isProtectedEntry(entry) {
  return Boolean(
    entry?.protected
    || entry?.isProtected
    || entry?.locked
    || entry?.requiresPassword,
  );
}

function createDeferredAction(kind, payload = {}) {
  return { kind, ...payload };
}

function openProtectedUnlockModal(path, deferredAction, error = '') {
  store.dispatch(actions.app.setModal({
    type: 'unlock-path',
    loading: false,
    error,
    path,
    deferredAction,
  }));
}

function humanSort(mode) {
  if (mode === 'time') return '按时间';
  if (mode === 'size') return '按大小';
  return '按名称';
}

function humanView(mode) {
  return mode === 'list' ? '列表' : '网格';
}

function formatTime(value) {
  const time = Number(value || 0);
  if (!time) return '未知时间';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
}

function formatRelative(value) {
  const time = Number(value || 0);
  if (!time) return '刚刚';
  const diff = Date.now() - time;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.max(1, Math.round(diff / minute))} 分钟前`;
  if (diff < day) return `${Math.max(1, Math.round(diff / hour))} 小时前`;
  return `${Math.max(1, Math.round(diff / day))} 天前`;
}

async function copyText(value, successText = '已复制') {
  try {
    await navigator.clipboard.writeText(value);
    dispatchToast('success', successText);
    return true;
  } catch (_) {
    dispatchToast('error', '复制失败');
    return false;
  }
}

function humanError(response, data, fallback) {
  const raw = data?.failed?.[0]?.message || data?.message || '';
  if (response?.status === 401) return '登录状态已失效，请重新登录。';
  if (response?.status === 403) {
    if (/csrf/i.test(raw)) return '安全校验已过期，请刷新页面后重试。';
    return '当前没有权限执行这个操作。';
  }
  if (response?.status === 409) return '目标位置存在同名项目，请更换名称后重试。';
  return raw || fallback;
}

const {
  currentEntries,
  getSelectedEntry,
  entryKey,
  getEntryPath,
  detectContentMode,
  findCurrentEntryByPath,
  selectedEntriesFromState,
  requiresProtectedUnlock,
} = createStateSelectors({
  formatBytes,
  inferKind,
  normalizeKey,
  isProtectedEntry,
});

const { apiClient, request, authApi, fileApi, trashApi, shareApi, adminApi } = createApiLayer({
  fetchImpl: fetch,
  getState: () => store.getState(),
  encodeRouteKey,
  normalizeKey,
  FormDataImpl: FormData,
  HeadersImpl: Headers,
});

const { previewService, uploadService } = createServices({
  detectContentMode,
  getState: () => store.getState(),
  getEntryPath,
  splitUploadTarget,
  ensureRemoteDirectoryTree,
  fileApi,
});

function syncHomeUrl(path, query) {
  if (page !== 'home') return;
  const url = new URL(window.location.href);
  if (path) url.searchParams.set('path', path);
  else url.searchParams.delete('path');
  if (query) url.searchParams.set('q', query);
  else url.searchParams.delete('q');
  window.history.replaceState({}, '', url.toString());
}

const thunks = createThunks({
  actions,
  authApi,
  trashApi,
  fileApi,
  adminApi,
  shareApi,
  previewService,
  uploadService,
  normalizeKey,
  syncHomeUrl,
  dispatchToast,
  getEntryPath,
  requiresProtectedUnlock,
  openProtectedUnlockModal,
  createDeferredAction,
  humanError,
  copyText,
  getPage: () => page,
  openDownload,
  findCurrentEntryByPath,
  getStore: () => store,
});

const { renderModal: modalRenderer, renderToast: toastRenderer } = createModalRenderers({
  icons,
  escapeHtml,
  getEntryPath,
  apiClient,
});

const {
  renderInspector: sharedRenderInspector,
  renderBatchBar: sharedRenderBatchBar,
  renderTrashBatchBar: sharedRenderTrashBatchBar,
  renderKindOptions: sharedRenderKindOptions,
  renderCrumb: sharedRenderCrumb,
  buildBreadcrumbs: sharedBuildBreadcrumbs,
  renderEntryCard: sharedRenderEntryCard,
  renderEmptyState: sharedRenderEmptyState,
} = createSharedRenderers({
  icons,
  escapeHtml,
  inferKind,
  formatTime,
  formatRelative,
  formatBytes,
  entryKey,
  iconForKind,
  iconClass,
  normalizeKey,
});

const { renderHomePage: homeRenderer } = createHomeRenderers({
  icons,
  escapeHtml,
  currentEntries,
  getSelectedEntry,
  selectedEntriesFromState,
  buildBreadcrumbs: sharedBuildBreadcrumbs,
  humanSort,
  humanView,
  renderKindOptions: sharedRenderKindOptions,
  renderCrumb: sharedRenderCrumb,
  renderEntryCard: sharedRenderEntryCard,
  renderInspector: sharedRenderInspector,
  renderBatchBar: sharedRenderBatchBar,
  renderTrashBatchBar: sharedRenderTrashBatchBar,
  renderEmptyState: sharedRenderEmptyState,
  formatBytes,
});

const { renderAdminPage: adminRenderer, renderSharePage: shareRenderer } = createPageRenderers({
  icons,
  escapeHtml,
  renderEmptyState: sharedRenderEmptyState,
  formatBytes,
  formatTime,
  formatRelative,
});

registerAppEvents({
  documentRef: document,
  windowRef: window,
  store,
  actions,
  thunks,
  page,
  dispatchToast,
  navigateToExplorerPath,
  collectSelectedPaths,
  findEntryByKey,
  getEntryPath,
  inferKind,
  requiresProtectedUnlock,
  openProtectedUnlockModal,
  createDeferredAction,
  openDownload,
  encodeRouteKey,
  copyText,
  setSearchTimer: value => {
    searchTimer = value;
  },
  getSearchTimer: () => searchTimer,
  syncHomeUrl,
});

function render() {
  const state = store.getState();
  const selected = page === 'home' ? getSelectedEntry(state) : null;
  root.innerHTML = `
    <div class="app-shell">
      <div class="workspace">
        ${renderHeader(state)}
        ${renderMain(state)}
      </div>
      ${
        page === 'home'
          ? `
            <div class="details-drawer-wrap ${selected ? 'is-open' : ''}">
              <div class="details-drawer-backdrop" data-action="clear-selected"></div>
              <aside class="details-drawer ${selected ? 'is-open' : ''}">
                <div class="details-drawer-head">
                  <div>
                    <h3 class="details-panel-title">文件详细</h3>
                  </div>
                  <button class="details-close" data-action="clear-selected">×</button>
                </div>
                <div class="details-drawer-body">
                  ${sharedRenderInspector(selected, state)}
                </div>
              </aside>
            </div>
          `
          : ''
      }
      ${modalRenderer(state)}
      ${toastRenderer(state)}
    </div>
  `;
}

function renderHeader(state) {
  const { role } = state.app;
  const searchValue = page === 'home' ? state.explorer.queryDraft : '';
  const searchDisabled = page !== 'home';
  const searchPlaceholder = page === 'home' ? '搜索文件...' : page === 'admin' ? '' : '当前页面无需搜索';

  return `
    <header class="topbar glass-card">
      <a class="brand" href="/">
        <span class="brand-badge">${icons.cloud}</span>
        <span>
          <h1 class="brand-name">O-Drive</h1>
        </span>
      </a>
      <div class="header-right">
        ${page === 'home' ? `
          <label class="search-box">
            <span class="search-icon">${icons.search}</span>
            <input
              type="search"
              value="${escapeHtml(searchValue)}"
              placeholder="${escapeHtml(searchPlaceholder)}"
              data-role="search-input"
              ${searchDisabled ? 'disabled' : ''}
            >
          </label>
        ` : ''}
        <div class="header-actions">
          ${
            page === 'admin'
              ? `<a class="btn header-btn" href="/">返回云盘</a>`
              : `${page !== 'admin' ? `<a class="btn header-btn" href="/admin">管理</a>` : ''}${role === 'admin'
                  ? `<button class="btn header-btn" data-action="logout">退出</button>`
                  : `<button class="btn header-btn" data-action="open-login">登录</button>`}`
          }
        </div>
      </div>
    </header>
  `;
}
function renderMain(state) {
  if (page === 'admin') return adminRenderer(state);
  if (page === 'share') return shareRenderer(state);
  return homeRenderer(state);
}

function openDownload(entry) {
  const downloadUrl = apiClient.downloadUrl(getEntryPath(entry));
  if (!downloadUrl) return;
  window.location.href = downloadUrl;
}

function findEntryByKey(key) {
  return currentEntries(store.getState()).find(item => entryKey(item) === key) || null;
}

function navigateToExplorerPath(path = '') {
  store.dispatch(actions.explorer.setTrashMode(false));
  store.dispatch(actions.explorer.setPath(path));
  store.dispatch(actions.explorer.setQuery(''));
  store.dispatch(actions.explorer.setQueryDraft(''));
  store.dispatch(thunks.loadExplorer());
}

function collectSelectedPaths(state) {
  return state.explorer.selectedKeys
    .map(id => findEntryByKey(id))
    .filter(Boolean)
    .map(item => getEntryPath(item))
    .filter(Boolean);
}

store.subscribe(render);
render();

store.dispatch(actions.app.setNow(Date.now()));
store.dispatch(thunks.loadRole()).then(async () => {
  if (page === 'home') {
    await store.dispatch(thunks.loadExplorer());
  } else if (page === 'admin') {
    if (store.getState().app.role === 'admin') {
      await Promise.all([
        store.dispatch(thunks.loadAdminStats()),
        store.dispatch(thunks.loadAdminShares()),
      ]);
    }
  } else if (page === 'share') {
    await store.dispatch(thunks.loadShare());
  }
});

