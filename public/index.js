const root = document.getElementById('app');
const page = document.body.dataset.page || 'home';

const icons = {
  cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 19.2a4.7 4.7 0 0 1-.6-9.36A7.2 7.2 0 0 1 19.45 11a4.01 4.01 0 0 1-.65 8.95H6.2Z"/></svg>',
  folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.75A2.75 2.75 0 0 1 5.75 4h4.02c.8 0 1.56.35 2.08.96l1 1.18c.24.29.6.46.98.46h4.42A2.75 2.75 0 0 1 21 9.35v7.9A2.75 2.75 0 0 1 18.25 20H5.75A2.75 2.75 0 0 1 3 17.25v-10.5Z"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.75A1.75 1.75 0 0 1 5.75 4h12.5A1.75 1.75 0 0 1 20 5.75v12.5A1.75 1.75 0 0 1 18.25 20H5.75A1.75 1.75 0 0 1 4 18.25V5.75Zm4 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm10.5 8.9-3.34-3.34a1 1 0 0 0-1.42 0l-1.44 1.44-2.18-2.18a1 1 0 0 0-1.4 0L5.5 16.3v1.95h13v-1.1Z"/></svg>',
  video: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v1.32l2.77-1.54A1.5 1.5 0 0 1 21 7.6v8.8a1.5 1.5 0 0 1-2.23 1.31L16 16.18v1.32A2.5 2.5 0 0 1 13.5 20h-7A2.5 2.5 0 0 1 4 17.5v-11Z"/></svg>',
  audio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4.25a1 1 0 0 1 1.25-.97l2.5.67A1.5 1.5 0 0 1 20 5.4v9.52a3.5 3.5 0 1 1-2-3.15V7.04l-3-.8v10.68a3.5 3.5 0 1 1-2-3.15V4.25Z"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.75A1.75 1.75 0 0 1 7.75 2h5.9c.46 0 .9.18 1.23.5l3.62 3.63c.33.33.5.77.5 1.23v12.89A1.75 1.75 0 0 1 17.25 22H7.75A1.75 1.75 0 0 1 6 20.25V3.75Zm7 0v3.5h3.5"/></svg>',
  text: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.75A1.75 1.75 0 0 1 7.75 2h8.5A1.75 1.75 0 0 1 18 3.75v16.5A1.75 1.75 0 0 1 16.25 22h-8.5A1.75 1.75 0 0 1 6 20.25V3.75Zm3.25 4.5h5.5v1.5h-5.5v-1.5Zm0 3.5h5.5v1.5h-5.5v-1.5Zm0 3.5h3.5v1.5h-3.5v-1.5Z"/></svg>',
  archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10l1 4v13.25A1.75 1.75 0 0 1 16.25 22h-8.5A1.75 1.75 0 0 1 6 20.25V7l1-4Zm2.25 2-.5 2h6.5l-.5-2h-5.5Zm1.25 5h3v6h-3v-6Z"/></svg>',
  app: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.75A1.75 1.75 0 0 1 6.75 3h10.5A1.75 1.75 0 0 1 19 4.75v14.5A1.75 1.75 0 0 1 17.25 21H6.75A1.75 1.75 0 0 1 5 19.25V4.75Zm4 3.25h6v1.5H9V8Zm0 3.5h6v1.5H9v-1.5Zm0 3.5h3.5v1.5H9V15Z"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.75A1.75 1.75 0 0 1 8.75 2h5.9c.46 0 .9.18 1.23.5l3.62 3.63c.33.33.5.77.5 1.23v12.89A1.75 1.75 0 0 1 18.25 22h-9.5A1.75 1.75 0 0 1 7 20.25V3.75Zm7 0v3.5h3.5"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm8.78 13.72-3.4-3.4"/></svg>',
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
    width: 48px;
    height: 48px;
    border-radius: 18px;
    display: grid;
    place-items: center;
    color: white;
    background: linear-gradient(135deg, #0ea5b7 0%, #144e62 100%);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), 0 14px 32px rgba(20, 78, 98, 0.28);
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
    font-family: var(--display-font);
    font-size: clamp(28px, 3vw, 40px);
    line-height: 0.95;
    letter-spacing: 0.01em;
  }

  .brand-meta {
    margin-top: 6px;
    font-size: 12px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .search-box {
    position: relative;
    width: min(360px, 100%);
    min-width: 220px;
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
    border-radius: 18px;
    padding: 13px 18px 13px 46px;
  }

  .search-icon {
    position: absolute;
    inset: 0 auto 0 16px;
    width: 18px;
    height: 18px;
    margin: auto 0;
    color: var(--muted);
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
    gap: 8px;
    flex-wrap: wrap;
    padding: 8px;
    border-radius: 18px;
    background: rgba(250, 252, 254, 0.9);
    border: 1px solid rgba(68, 98, 122, 0.12);
  }

  .crumb {
    padding: 8px 12px;
    border-radius: 12px;
    color: var(--muted);
    border: 0;
    background: transparent;
  }

  .crumb.is-current {
    background: rgba(14, 116, 144, 0.09);
    color: var(--accent-strong);
    font-weight: 700;
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

    .search-box {
      width: 100%;
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
      font-size: 28px;
    }

    .btn {
      width: 100%;
      justify-content: center;
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

function currentEntries(state) {
  const explorer = state.explorer;
  if (explorer.trashMode) {
    return applySort(
      explorer.trashItems
        .map(item => ({
          ...item,
          kind: item.kind || 'file',
          fullKey: item.original_key || '',
          name: item.name || '',
          rawSize: Number(item.size || 0),
          time: Number(item.trashed_at || 0),
          sizeFormatted: formatBytes(item.size || 0),
          trashedAt: Number(item.trashed_at || 0),
          trashId: item.id,
        }))
        .filter(item => explorer.filter === 'all' || item.kind === explorer.filter),
      explorer.sort,
    );
  }

  const folders = (explorer.folders || []).map(item => ({
    ...item,
    kind: 'folder',
    rawSize: 0,
    time: Number(item.time || 0),
  }));
  const files = (explorer.files || []).map(item => ({
    ...item,
    kind: inferKind(item),
    rawSize: Number(item.rawSize || item.size || 0),
    time: Number(item.time || item.uploaded || 0),
  }));
  const filteredFolders = explorer.filter === 'all' || explorer.filter === 'folder' ? folders : [];
  const filteredFiles = files.filter(item => explorer.filter === 'all' || item.kind === explorer.filter);
  return applySort([...filteredFolders, ...filteredFiles], explorer.sort);
}

function applySort(entries, mode) {
  const list = [...entries];
  const alpha = (a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' });
  list.sort((a, b) => {
    if (mode === 'smart' && a.kind === 'folder' && b.kind !== 'folder') return -1;
    if (mode === 'smart' && a.kind !== 'folder' && b.kind === 'folder') return 1;
    if (mode === 'time') {
      if ((b.time || 0) !== (a.time || 0)) return (b.time || 0) - (a.time || 0);
      return alpha(a, b);
    }
    if (mode === 'size') {
      if ((b.rawSize || 0) !== (a.rawSize || 0)) return (b.rawSize || 0) - (a.rawSize || 0);
      return alpha(a, b);
    }
    return alpha(a, b);
  });
  return list;
}

function getSelectedEntry(state) {
  const key = state.explorer.selectedKey;
  if (!key) return null;
  return currentEntries(state).find(item => entryKey(item) === key) || null;
}

function entryKey(entry) {
  return entry.trashId || entry.fullKey || entry.path || entry.name;
}

function hasPreview(entry) {
  const kind = entry.kind || inferKind(entry);
  return kind !== 'folder' && ['image', 'video', 'audio', 'pdf', 'text', 'file', 'app', 'archive'].includes(kind);
}

function getEntryPath(entry) {
  return entry.fullKey || entry.path || entry.original_key || '';
}

function findCurrentEntryByPath(path) {
  const normalized = normalizeKey(path);
  return currentEntries(store.getState()).find(item => normalizeKey(getEntryPath(item)) === normalized) || null;
}

function detectContentMode(entry) {
  const kind = entry.kind || inferKind(entry);
  if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'pdf') return kind;
  return 'text';
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
    const route = parent ? `/api/mkdir/${encodeRouteKey(parent)}` : '/api/mkdir';
    const { response, data } = await request(route, {
      method: 'POST',
      json: { folderName: part, storageId: 'r2' },
      csrf: true,
    });
    if (!response.ok && !/already exists/i.test(data?.message || '')) {
      throw new Error(humanError(response, data, `创建目录 ${current} 失败`));
    }
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

function humanSort(mode) {
  if (mode === 'time') return '按时间';
  if (mode === 'size') return '按大小';
  return '按名称';
}

function humanView(mode) {
  return mode === 'list' ? '列表' : '网格';
}

async function request(pathname, options = {}) {
  const state = store.getState();
  const headers = new Headers(options.headers || {});
  if (options.json) {
    headers.set('Content-Type', 'application/json');
    options.body = JSON.stringify(options.json);
  }
  if (options.csrf && state.app.csrf) {
    headers.set('X-CSRF-Token', state.app.csrf);
  }
  const response = await fetch(pathname, {
    ...options,
    headers,
    credentials: 'same-origin',
  });
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await response.json().catch(() => ({})) : null;
  return { response, data };
}

function syncHomeUrl(path, query) {
  if (page !== 'home') return;
  const url = new URL(window.location.href);
  if (path) url.searchParams.set('path', path);
  else url.searchParams.delete('path');
  if (query) url.searchParams.set('q', query);
  else url.searchParams.delete('q');
  window.history.replaceState({}, '', url.toString());
}

const thunks = {
  loadRole: () => async dispatch => {
    try {
      const { response, data } = await request('/api/auth/role');
      if (!response.ok) {
        dispatch(actions.app.setRole({ role: 'guest', csrf: '' }));
        dispatch(actions.app.setBooting(false));
        return;
      }
      dispatch(actions.app.setRole(data));
    } catch (_) {
      dispatch(actions.app.setRole({ role: 'guest', csrf: '' }));
    } finally {
      dispatch(actions.app.setBooting(false));
    }
  },
  loadExplorer: () => async (dispatch, getState) => {
    const state = getState();
    dispatch(actions.explorer.setLoading(true));
    dispatch(actions.explorer.setSelection(''));
    const path = normalizeKey(state.explorer.path);
    const query = state.explorer.query.trim();
    try {
      if (state.explorer.trashMode) {
        const { response, data } = await request(`/api/trash?page=1&size=100&q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error(data?.message || '回收站加载失败');
        dispatch(actions.explorer.setData({ trashItems: data.items || [] }));
        return;
      }

      if (query) {
        const scope = path ? `/${path}` : '/';
        const { response, data } = await request(`/api/search?q=${encodeURIComponent(query)}&scope=${encodeURIComponent(scope)}&limit=60`);
        if (!response.ok) throw new Error(data?.message || '搜索失败');
        dispatch(actions.explorer.setData({ folders: [], files: data.files || [] }));
        return;
      }

      const route = path ? `/api/files/${encodeRouteKey(path)}` : '/api/files';
      const { response, data } = await request(route);
      if (!response.ok) throw new Error(data?.message || '目录加载失败');
      dispatch(actions.explorer.setData({
        folders: data.folders || [],
        files: data.files || [],
        storageId: data.storageId || 'r2',
      }));
      syncHomeUrl(path, query);
    } catch (error) {
      dispatch(actions.explorer.setError(error.message || '加载失败'));
    }
  },
  loadAdminStats: () => async dispatch => {
    dispatch(actions.admin.setLoading(true));
    try {
      const { response, data } = await request('/api/admin/stats');
      if (!response.ok) throw new Error(data?.message || '管理概览加载失败');
      dispatch(actions.admin.setStats(data));
    } catch (error) {
      dispatch(actions.admin.setError(error.message || '管理概览加载失败'));
    }
  },
  loadShare: () => async (dispatch, getState) => {
    const token = getState().share.token.trim();
    if (!token) {
      dispatch(actions.share.setError('请提供分享口令或 token。'));
      return;
    }
    dispatch(actions.share.setLoading(true));
    try {
      const { response, data } = await request(`/api/share/${encodeURIComponent(token)}/info`);
      if (response.status === 403 && data?.code === 'SHARE_PASSWORD_REQUIRED') {
        dispatch(actions.share.setPasswordRequired('该分享需要访问密码。'));
        return;
      }
      if (!response.ok) throw new Error(data?.message || '分享信息加载失败');
      dispatch(actions.share.setData(data.item));
    } catch (error) {
      dispatch(actions.share.setError(error.message || '分享信息加载失败'));
    }
  },
  login: credentials => async dispatch => {
    dispatch(actions.app.setModal({ type: 'login', loading: true, error: '', values: credentials }));
    try {
      const { response, data } = await request('/api/login', {
        method: 'POST',
        json: credentials,
      });
      if (!response.ok || !data?.success) {
        dispatch(actions.app.setModal({
          type: 'login',
          loading: false,
          error: data?.message || '用户名或密码错误',
          values: credentials,
        }));
        return;
      }
      dispatch(actions.app.setModal(null));
      await dispatch(thunks.loadRole());
      dispatchToast('success', '管理员登录成功');
      if (page === 'admin') await dispatch(thunks.loadAdminStats());
      else await dispatch(thunks.loadExplorer());
    } catch (_) {
      dispatch(actions.app.setModal({
        type: 'login',
        loading: false,
        error: '登录请求失败',
        values: credentials,
      }));
    }
  },
  logout: () => async dispatch => {
    try {
      await request('/api/logout');
      dispatch(actions.app.setRole({ role: 'guest', csrf: '' }));
      dispatchToast('success', '已退出管理员账户');
      if (page === 'admin') dispatch(actions.admin.setError('当前未登录管理员账户。'));
      if (page === 'home') dispatch(actions.explorer.setTrashMode(false));
      await dispatch(thunks.loadExplorer());
    } catch (_) {
      dispatchToast('error', '退出失败');
    }
  },
  createFolder: folderName => async (dispatch, getState) => {
    const name = String(folderName || '').trim();
    if (!name) return;
    const state = getState();
    const path = normalizeKey(state.explorer.path);
    try {
      const { response, data } = await request(path ? `/api/mkdir/${encodeRouteKey(path)}` : '/api/mkdir', {
        method: 'POST',
        json: { folderName: name, storageId: state.explorer.storageId || 'r2' },
        csrf: true,
      });
      if (!response.ok || !data?.success) throw new Error(data?.message || '创建文件夹失败');
      dispatch(actions.app.setModal(null));
      dispatchToast('success', `已创建文件夹「${name}」`);
      await dispatch(thunks.loadExplorer());
    } catch (error) {
      dispatch(actions.app.setModal({
        type: 'folder',
        loading: false,
        error: error.message || '创建文件夹失败',
        values: { folderName: name },
      }));
    }
  },
  uploadFiles: files => async (dispatch, getState) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    const state = getState();
    let uploaded = 0;
    try {
      for (const file of list) {
        const relative = String(file.webkitRelativePath || '');
        const basePath = normalizeKey(state.explorer.path);
        const relativeParts = relative.split('/').filter(Boolean);
        const targetName = relativeParts.length ? relativeParts[relativeParts.length - 1] : file.name;
        const relativeDir = relativeParts.length > 1 ? relativeParts.slice(0, -1).join('/') : '';
        const targetDir = [basePath, relativeDir].filter(Boolean).join('/');
        if (relativeDir) {
          await ensureRemoteDirectoryTree(targetDir);
        }
        const route = targetDir ? `/api/files/${encodeRouteKey(targetDir)}?conflict=rename` : '/api/files?conflict=rename';
        const form = new FormData();
        form.append('file', file, targetName);
        const { response, data } = await request(route, {
          method: 'POST',
          body: form,
          csrf: true,
        });
        if (!response.ok || !data?.success) {
          throw new Error(data?.message || `上传 ${file.name} 失败`);
        }
        uploaded += 1;
      }
      dispatchToast('success', `已上传 ${uploaded} 个文件`);
      await dispatch(thunks.loadExplorer());
    } catch (error) {
      dispatchToast('error', error.message || '上传失败');
    }
  },
  previewEntry: entry => async dispatch => {
    if (!entry || !getEntryPath(entry)) return;
    const contentMode = detectContentMode(entry);
    const baseModal = {
      type: 'preview',
      loading: true,
      error: '',
      entry,
      contentMode,
      content: '',
      editable: store.getState().app.role === 'admin' && contentMode === 'text',
      editing: false,
    };
    dispatch(actions.app.setModal(baseModal));
    if (contentMode !== 'text') {
      dispatch(actions.app.setModal({ ...baseModal, loading: false }));
      return;
    }
    try {
      const key = encodeRouteKey(getEntryPath(entry));
      const response = await fetch(`/api/preview/${key}`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`读取失败 (${response.status})`);
      const text = await response.text();
      dispatch(actions.app.setModal({ ...baseModal, loading: false, content: text }));
    } catch (error) {
      dispatch(actions.app.setModal({ ...baseModal, loading: false, error: error.message || '预览失败' }));
    }
  },
  savePreviewText: content => async (dispatch, getState) => {
    const modal = getState().app.modal;
    const path = modal?.entry ? getEntryPath(modal.entry) : '';
    if (!path) return;
    try {
      const { response, data } = await request(`/api/save-text/${encodeRouteKey(path)}`, {
        method: 'POST',
        json: { content },
        csrf: true,
      });
      if (!response.ok || data?.success === false) throw new Error(humanError(response, data, '保存失败'));
      dispatch(actions.app.setModal({ ...modal, editing: false, content }));
      dispatchToast('success', '文本内容已保存');
    } catch (error) {
      dispatchToast('error', error.message || '保存失败');
    }
  },
  createShare: entry => async dispatch => {
    if (!entry || !getEntryPath(entry)) return;
    dispatch(actions.app.setModal({
      type: 'share',
      loading: false,
      error: '',
      entry,
      values: {
        expiresInDays: '7',
        maxDownloads: '0',
        password: '',
        allowPreview: true,
        allowDownload: true,
      },
    }));
  },
  submitShare: values => async (dispatch, getState) => {
    const modal = getState().app.modal;
    const entry = modal?.entry;
    const path = entry ? getEntryPath(entry) : '';
    if (!path) return;
    try {
      const payload = {
        path,
        expiresInDays: Number(values.expiresInDays || 0),
        maxDownloads: Number(values.maxDownloads || 0),
        password: String(values.password || '').trim(),
        allowPreview: Boolean(values.allowPreview),
        allowDownload: Boolean(values.allowDownload),
      };
      const { response, data } = await request('/api/admin/shares', {
        method: 'POST',
        json: payload,
        csrf: true,
      });
      if (!response.ok || !data?.item?.token) throw new Error(humanError(response, data, '创建分享失败'));
      const link = `${window.location.origin}/share.html?token=${encodeURIComponent(data.item.token)}`;
      await copyText(link, '分享链接已创建并复制');
      dispatch(actions.app.setModal(null));
    } catch (error) {
      dispatch(actions.app.setModal({ ...modal, error: error.message || '创建分享失败', values }));
    }
  },
  restoreTrash: trashId => async dispatch => {
    try {
      const { response, data } = await request('/api/trash/restore', {
        method: 'POST',
        json: { id: trashId },
        csrf: true,
      });
      if (!response.ok || data?.success === false) throw new Error(humanError(response, data, '恢复失败'));
      dispatchToast('success', '已从回收站恢复');
      await dispatch(thunks.loadExplorer());
    } catch (error) {
      dispatchToast('error', error.message || '恢复失败');
    }
  },
  deleteTrash: trashId => async dispatch => {
    try {
      const { response, data } = await request('/api/trash/delete', {
        method: 'DELETE',
        json: { id: trashId },
        csrf: true,
      });
      if (!response.ok || data?.success === false) throw new Error(humanError(response, data, '彻底删除失败'));
      dispatchToast('success', '回收站记录已彻底删除');
      await dispatch(thunks.loadExplorer());
    } catch (error) {
      dispatchToast('error', error.message || '彻底删除失败');
    }
  },
  clearTrash: () => async dispatch => {
    try {
      const { response, data } = await request('/api/trash/clear', {
        method: 'DELETE',
        json: {},
        csrf: true,
      });
      if (!response.ok) throw new Error(humanError(response, data, '清空回收站失败'));
      dispatchToast('success', '回收站已清空');
      await dispatch(thunks.loadExplorer());
    } catch (error) {
      dispatchToast('error', error.message || '清空回收站失败');
    }
  },
  batchDelete: paths => async dispatch => {
    if (!paths?.length) return;
    try {
      const { response, data } = await request('/api/batch-delete', {
        method: 'POST',
        json: { paths },
        csrf: true,
      });
      if (!response.ok || data?.success === false && !data?.completed) throw new Error(humanError(response, data, '删除失败'));
      dispatch(actions.explorer.setSelectedKeys([]));
      dispatchToast('success', data?.completed ? `已处理 ${data.completed} 项` : '已移入回收站');
      await dispatch(thunks.loadExplorer());
    } catch (error) {
      dispatchToast('error', error.message || '删除失败');
    }
  },
  renameEntry: (path, newName) => async dispatch => {
    if (!path || !newName) return;
    try {
      const { response, data } = await request(`/api/files/${encodeRouteKey(path)}`, {
        method: 'PUT',
        json: { newName },
        csrf: true,
      });
      if (!response.ok) throw new Error(humanError(response, data, '重命名失败'));
      dispatch(actions.app.setModal(null));
      dispatchToast('success', '已完成重命名');
      await dispatch(thunks.loadExplorer());
    } catch (error) {
      const modal = store.getState().app.modal;
      dispatch(actions.app.setModal({ ...modal, error: error.message || '重命名失败', values: { newName } }));
    }
  },
  pasteClipboard: () => async (dispatch, getState) => {
    const clipboard = getState().explorer.clipboard;
    if (!clipboard?.paths?.length) return;
    try {
      const { response, data } = await request('/api/paste', {
        method: 'POST',
        json: {
          action: clipboard.action,
          paths: clipboard.paths,
          targetDir: `/${normalizeKey(getState().explorer.path)}`.replace(/\/$/, '') || '/',
        },
        csrf: true,
      });
      if (!response.ok || data?.success === false && !data?.completed) throw new Error(humanError(response, data, '粘贴失败'));
      dispatch(actions.explorer.setClipboard(null));
      dispatch(actions.explorer.setSelectedKeys([]));
      dispatchToast('success', clipboard.action === 'move' ? '已执行移动' : '已执行复制');
      await dispatch(thunks.loadExplorer());
    } catch (error) {
      dispatchToast('error', error.message || '粘贴失败');
    }
  },
  unlockShare: password => async (dispatch, getState) => {
    const token = getState().share.token.trim();
    if (!token) return;
    dispatch(actions.share.setLoading(true));
    try {
      const { response, data } = await request(`/api/share/${encodeURIComponent(token)}/unlock`, {
        method: 'POST',
        json: { password },
      });
      if (!response.ok || !data?.success) throw new Error(data?.message || '密码错误');
      dispatchToast('success', '分享已解锁');
      dispatch(actions.share.setPassword(''));
      await dispatch(thunks.loadShare());
    } catch (error) {
      dispatch(actions.share.setPasswordRequired(error.message || '密码错误'));
    }
  },
};

function render() {
  const state = store.getState();
  root.innerHTML = `
    <div class="app-shell">
      <div class="workspace">
        ${renderHeader(state)}
        ${renderMain(state)}
      </div>
      ${renderModal(state)}
      ${renderToast(state)}
    </div>
  `;
}

function renderHeader(state) {
  const { role } = state.app;
  const searchValue = page === 'home' ? state.explorer.queryDraft : '';
  const searchDisabled = page !== 'home';
  const searchPlaceholder = page === 'home' ? '搜索文件、资源或路径' : page === 'admin' ? '管理台已切换到概览模式' : '当前页面无需搜索';

  return `
    <header class="topbar glass-card">
      <a class="brand" href="/">
        <span class="brand-badge">${icons.cloud}</span>
        <span>
          <h1 class="brand-name">O-Drive</h1>
          <div class="brand-meta">cloud archive atelier</div>
        </span>
      </a>
      <div class="header-right">
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
        <div class="btn-row">
          <span class="toolbar-tag">${role === 'admin' ? '管理员模式' : '访客模式'}</span>
          ${page !== 'home' ? `<a class="btn" href="/">返回文件中心</a>` : ''}
          ${page !== 'admin' ? `<a class="btn" href="/admin">管理台</a>` : ''}
          ${
            role === 'admin'
              ? `
                <button class="btn btn-danger" data-action="logout">
                  <span class="icon">${icons.logout}</span>退出
                </button>
              `
              : `
                <button class="btn btn-primary" data-action="open-login">
                  <span class="icon">${icons.lock}</span>管理员登录
                </button>
              `
          }
        </div>
      </div>
    </header>
  `;
}

function renderMain(state) {
  if (page === 'admin') return renderAdminPage(state);
  if (page === 'share') return renderSharePage(state);
  return renderHomePage(state);
}

function renderHomePage(state) {
  const explorer = state.explorer;
  const entries = currentEntries(state);
  const selected = getSelectedEntry(state);
  const selectedEntries = entries.filter(item => explorer.selectedKeys.includes(entryKey(item)));
  const breadcrumbs = buildBreadcrumbs(explorer.path);
  const totalCount = entries.length;
  const totalSize = entries.reduce((sum, item) => sum + Number(item.rawSize || 0), 0);
  const subtitle = explorer.trashMode
    ? '回收站视图会集中展示已删除项目，便于恢复或彻底清理。'
    : explorer.query
      ? `当前正在当前目录中搜索“${escapeHtml(explorer.query)}”。`
      : '按照你提供的 HTML 框架，整理为可浏览、可搜索、可扩展的云盘前端。';

  return `
    <section class="toolbar glass-card">
      <div class="toolbar-left">
        <div class="crumbs">
          ${breadcrumbs.map(renderCrumb).join('')}
        </div>
        <span class="toolbar-tag">${explorer.trashMode ? '回收站' : `存储桶 ${escapeHtml(explorer.storageId.toUpperCase())}`}</span>
      </div>
      <div class="toolbar-right">
        <button class="btn" data-action="refresh-explorer">
          <span class="icon">${icons.refresh}</span>刷新
        </button>
        <button class="btn" data-action="upload">
          <span class="icon">${icons.upload}</span>上传
        </button>
        ${state.app.role === 'admin' ? `
          <button class="btn" data-action="upload-folder">
            <span class="icon">${icons.folder}</span>文件夹上传
          </button>
        ` : ''}
        <button class="btn" data-action="open-folder-modal">
          <span class="icon">${icons.plus}</span>新建
        </button>
        <button class="btn" data-action="cycle-sort">
          ${humanSort(explorer.sort)}
        </button>
        <button class="btn" data-action="toggle-view">
          <span class="icon">${explorer.view === 'grid' ? icons.list : icons.grid}</span>${humanView(explorer.view)}
        </button>
        <label class="sr-only" for="kind-filter">筛选</label>
        <select id="kind-filter" class="inline-select" data-role="kind-filter" style="width: 132px;">
          ${renderKindOptions(explorer.filter, explorer.trashMode)}
        </select>
        ${
          state.app.role === 'admin'
            ? `
              <button class="btn ${explorer.trashMode ? 'btn-primary' : ''}" data-action="toggle-trash">
                <span class="icon">${icons.trash}</span>${explorer.trashMode ? '退出回收站' : '回收站'}
              </button>
            `
            : ''
        }
      </div>
      <input class="sr-only" id="upload-input" type="file" multiple>
      <input class="sr-only" id="folder-upload-input" type="file" multiple webkitdirectory directory>
    </section>
    <section class="surface">
      <article class="explorer glass-card">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">${explorer.trashMode ? '回收站档案' : '资源浏览器'}</h2>
            <p class="panel-copy">${subtitle}</p>
          </div>
          <span class="toolbar-tag">${totalCount} 个项目</span>
        </div>
        <div class="panel-body">
          <div class="hero-strip">
            <div class="mini-stat">
              <div class="mini-stat-label">当前位置</div>
              <div class="mini-stat-value">${escapeHtml(explorer.path || '根目录')}</div>
              <div class="mini-stat-meta">${explorer.trashMode ? '回收站聚合视图' : '点击面包屑可快速返回上层目录'}</div>
            </div>
            <div class="mini-stat">
              <div class="mini-stat-label">文件体量</div>
              <div class="mini-stat-value">${formatBytes(totalSize)}</div>
              <div class="mini-stat-meta">${explorer.query ? '基于当前搜索结果统计' : '仅统计当前展示项目'}</div>
            </div>
            <div class="mini-stat">
              <div class="mini-stat-label">视图状态</div>
              <div class="mini-stat-value">${escapeHtml(humanView(explorer.view))}</div>
              <div class="mini-stat-meta">${escapeHtml(humanSort(explorer.sort))} · ${escapeHtml(explorer.filter === 'all' ? '全部类型' : explorer.filter)}</div>
            </div>
          </div>
          <div class="status-bar">
            <div class="status-main">
              <span class="status-dot"></span>
              <span>${explorer.loading ? '正在同步目录内容…' : explorer.error ? escapeHtml(explorer.error) : '数据接口已接入，列表会随着目录和搜索状态动态刷新。'}</span>
            </div>
            <div class="status-main">
              ${state.app.role === 'admin' ? '<span>支持上传与新建目录</span>' : '<span>当前为访客视图</span>'}
            </div>
          </div>
          ${
            explorer.selectedKeys.length
              ? renderBatchBar(state, selectedEntries)
              : explorer.clipboard?.paths?.length
                ? `
                  <div class="batch-bar">
                    <div class="status-main">
                      <span class="status-dot"></span>
                      <span>剪贴板中有 ${explorer.clipboard.paths.length} 项，准备${explorer.clipboard.action === 'move' ? '移动' : '复制'}到当前目录。</span>
                    </div>
                    <div class="btn-row">
                      <button class="btn btn-primary" data-action="paste-clipboard">
                        <span class="icon">${icons.paste}</span>执行粘贴
                      </button>
                      <button class="btn" data-action="clear-clipboard">清空剪贴板</button>
                    </div>
                  </div>
                `
                : ''
          }
          ${
            explorer.loading
              ? renderEmptyState('正在载入', '正在获取文件列表、目录结构和筛选结果，请稍候。', icons.refresh)
              : explorer.error
                ? renderEmptyState('加载失败', explorer.error, icons.lock)
                : entries.length
                  ? `
                    <div class="file-grid ${explorer.view === 'list' ? 'is-list' : ''}">
                      ${entries.map(item => renderEntryCard(item, state)).join('')}
                    </div>
                  `
                  : renderEmptyState(
                      explorer.query ? '没有搜索结果' : explorer.trashMode ? '回收站为空' : '目录还很安静',
                      explorer.query
                        ? '试试更短的关键词，或者切回目录浏览模式继续探索。'
                        : explorer.trashMode
                          ? '目前没有被删除的文件，主目录中的项目会保持干净整齐。'
                          : '你可以直接上传文件，或者创建一个新文件夹来开始整理资源。',
                      explorer.query ? icons.search : icons.folder,
                    )
          }
        </div>
      </article>
      <aside class="inspector glass-card">
        ${renderInspector(selected, state)}
      </aside>
    </section>
  `;
}

function renderAdminPage(state) {
  const { role } = state.app;
  const { loading, stats, error } = state.admin;

  if (role !== 'admin') {
    return `
      <section class="auth-board glass-card">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">管理台需要登录</h2>
            <p class="panel-copy">这里会汇总文件规模、索引状态、回收站占用和近期提醒。请先进入管理员模式。</p>
          </div>
        </div>
        <div class="panel-body">
          ${renderEmptyState('权限受限', '登录后即可查看统计概览、健康提醒和最新资源活动。', icons.lock)}
          <div class="btn-row" style="justify-content:center;">
            <button class="btn btn-primary" data-action="open-login">
              <span class="icon">${icons.lock}</span>管理员登录
            </button>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="admin-board glass-card">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">控制台概览</h2>
          <p class="panel-copy">聚合文件体量、索引健康、告警提示与最近资源，帮助你快速掌握云盘运行状态。</p>
        </div>
        <div class="btn-row">
          <span class="toolbar-tag">管理员实时视图</span>
          <button class="btn" data-action="refresh-admin">
            <span class="icon">${icons.refresh}</span>刷新概览
          </button>
        </div>
      </div>
      <div class="panel-body">
        ${
          loading
            ? renderEmptyState('正在加载概览', '正在统计文件数量、索引同步情况与回收站信息。', icons.stats)
            : error
              ? renderEmptyState('概览加载失败', error, icons.lock)
              : stats
                ? renderAdminStats(stats)
                : renderEmptyState('暂无数据', '管理接口已经就绪，但当前还没有返回可展示的数据。', icons.stats)
        }
      </div>
    </section>
  `;
}

function renderAdminStats(stats) {
  const total = Number(stats.files?.count || 0);
  const breakdown = Object.entries(stats.breakdown || {}).map(([key, value]) => ({ key, ...value }));
  const maxCount = Math.max(1, ...breakdown.map(item => Number(item.count || 0)));

  return `
    <div class="admin-grid">
      <div class="admin-card span-4">
        <div class="admin-label">文件总数</div>
        <div class="admin-value">${escapeHtml(String(stats.files?.count || 0))}</div>
        <div class="admin-copy">总容量 ${escapeHtml(stats.files?.totalSizeFormatted || '0 B')}，目录标记 ${escapeHtml(String(stats.files?.folderMarkers || 0))}。</div>
      </div>
      <div class="admin-card span-4">
        <div class="admin-label">回收站占用</div>
        <div class="admin-value">${escapeHtml(String(stats.trash?.count || 0))}</div>
        <div class="admin-copy">累计 ${escapeHtml(stats.trash?.sizeFormatted || '0 B')}，约占文件总量 ${escapeHtml(String(stats.trash?.percentOfFiles || 0))}% 。</div>
      </div>
      <div class="admin-card span-4">
        <div class="admin-label">索引状态</div>
        <div class="admin-value">${escapeHtml(stats.index?.recommendation || '等待初始化')}</div>
        <div class="admin-copy">索引记录 ${escapeHtml(String(stats.index?.count || 0))} 条，最近更新 ${escapeHtml(stats.index?.latestUpdatedAt ? formatTime(stats.index.latestUpdatedAt) : '未知')}。</div>
      </div>
      <div class="admin-card span-6">
        <div class="admin-label">类型分布</div>
        <div class="bars">
          ${breakdown.map(item => `
            <div class="bar-row">
              <span>${escapeHtml(item.key)}</span>
              <span class="bar-track"><span class="bar-fill" style="width:${Math.max(4, Math.round((Number(item.count || 0) / maxCount) * 100))}%"></span></span>
              <span>${escapeHtml(String(item.count || 0))}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="admin-card span-6">
        <div class="admin-label">系统提醒</div>
        <div class="attention-list">
          ${(stats.attention || []).map(item => `
            <article class="attention-item" data-level="${escapeHtml(item.level || 'info')}">
              <h3 class="attention-title">${escapeHtml(item.title || '系统提示')}</h3>
              <div class="attention-copy">${escapeHtml(item.body || '')}</div>
            </article>
          `).join('')}
        </div>
      </div>
      <div class="admin-card span-8">
        <div class="admin-label">最新资源</div>
        <div class="latest-list">
          ${(stats.latest || []).map(item => `
            <article class="latest-item">
              <h3 class="latest-title">${escapeHtml(item.key || '')}</h3>
              <div class="latest-copy">${escapeHtml(item.sizeFormatted || formatBytes(item.size || 0))} · ${escapeHtml(formatTime(item.uploaded || 0))}</div>
            </article>
          `).join('') || '<div class="muted">暂无最近资源记录</div>'}
        </div>
      </div>
      <div class="admin-card span-4">
        <div class="admin-label">辅助数据</div>
        <div class="stack" style="margin-top:16px;">
          <div class="detail-card">
            <div class="detail-key">日志保留</div>
            <div class="detail-value">${escapeHtml(String(stats.logs?.count || 0))} 条</div>
          </div>
          <div class="detail-card">
            <div class="detail-key">索引采样</div>
            <div class="detail-value">${escapeHtml(String(stats.index?.sampleCount || 0))} 条 · ${stats.index?.fresh ? '状态新鲜' : '建议重建'}</div>
          </div>
          <div class="detail-card">
            <div class="detail-key">可视化摘要</div>
            <div class="detail-value">文件 ${escapeHtml(String(total))} 个，覆盖 ${escapeHtml(Object.keys(stats.breakdown || {}).length.toString())} 类资源。</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSharePage(state) {
  const share = state.share;
  const item = share.item;

  return `
    <section class="share-board glass-card">
      <aside class="share-side">
        <span class="toolbar-tag">安全分享入口</span>
        <div style="margin-top:18px;">
          <h2 class="panel-title">分享访问页</h2>
          <p class="panel-copy">围绕分享信息、预览能力和密码解锁重新整理成独立访问体验。</p>
        </div>
        <div class="stack" style="margin-top:28px;">
          <div class="detail-card" style="background:rgba(255,255,255,0.12); border-color:rgba(255,255,255,0.14);">
            <div class="detail-key" style="color:rgba(255,255,255,0.7);">分享 Token</div>
            <div class="detail-value">${escapeHtml(share.token || '未提供')}</div>
          </div>
          <div class="detail-card" style="background:rgba(255,255,255,0.12); border-color:rgba(255,255,255,0.14);">
            <div class="detail-key" style="color:rgba(255,255,255,0.7);">访问状态</div>
            <div class="detail-value">${share.requiresPassword ? '需要密码' : item ? '可访问' : share.error ? '加载失败' : '等待读取'}</div>
          </div>
        </div>
      </aside>
      <div class="share-main">
        ${
          share.loading
            ? renderEmptyState('正在读取分享', '正在加载分享文件信息与预览权限。', icons.refresh)
            : share.error && !share.requiresPassword
              ? renderEmptyState('分享不可用', share.error, icons.lock)
              : share.requiresPassword
                ? renderShareUnlock(share)
                : item
                  ? renderShareContent(share, item)
                  : renderShareTokenHint()
        }
      </div>
    </section>
  `;
}

function renderShareUnlock(share) {
  return `
    <div class="empty-state" style="min-height:100%;">
      <div>
        <div class="empty-orb">${icons.lock}</div>
        <h3 class="empty-title">请输入访问密码</h3>
        <p class="empty-copy">${escapeHtml(share.error || '该分享资源启用了额外保护，输入正确密码后即可读取文件信息与预览内容。')}</p>
        <form class="modal-form" data-form="share-password" style="max-width:340px; margin:22px auto 0;">
          <input class="inline-input" type="password" name="password" value="${escapeHtml(share.password)}" placeholder="输入分享密码">
          <button class="btn btn-primary" type="submit">解锁分享</button>
        </form>
      </div>
    </div>
  `;
}

function renderShareTokenHint() {
  return `
    <div class="empty-state" style="min-height:100%;">
      <div>
        <div class="empty-orb">${icons.file}</div>
        <h3 class="empty-title">等待分享链接</h3>
        <p class="empty-copy">当前页面没有读到分享 token。可通过 share.html?token=你的分享码 打开，或者把 token 放进查询参数里。</p>
      </div>
    </div>
  `;
}

function renderShareContent(share, item) {
  return `
    <div class="status-bar">
      <div class="status-main">
        <span class="status-dot"></span>
        <span>${escapeHtml(item.name)} · ${escapeHtml(item.sizeFormatted)}</span>
      </div>
      <div class="btn-row">
        ${item.allowPreview ? `
          <a class="btn btn-ghost" href="/api/share/${encodeURIComponent(share.token)}/preview" target="_blank" rel="noreferrer">
            <span class="icon">${icons.eye}</span>新窗口预览
          </a>
        ` : ''}
        ${item.allowDownload ? `
          <a class="btn btn-primary" href="/api/share/${encodeURIComponent(share.token)}/download">
            <span class="icon">${icons.download}</span>下载文件
          </a>
        ` : ''}
      </div>
    </div>
    <div class="stack">
      <div class="hero-strip" style="margin-bottom:0;">
        <div class="mini-stat">
          <div class="mini-stat-label">分享文件</div>
          <div class="mini-stat-value">${escapeHtml(item.name)}</div>
          <div class="mini-stat-meta">${escapeHtml(item.contentType || '未知类型')}</div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-label">创建时间</div>
          <div class="mini-stat-value">${escapeHtml(formatTime(item.createdAt))}</div>
          <div class="mini-stat-meta">最后访问 ${escapeHtml(item.lastAccessedAt ? formatRelative(item.lastAccessedAt) : '尚未访问')}</div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-label">下载限制</div>
          <div class="mini-stat-value">${item.maxDownloads ? `${item.downloadCount}/${item.maxDownloads}` : '无限制'}</div>
          <div class="mini-stat-meta">${item.expiresAt ? `到期于 ${escapeHtml(formatTime(item.expiresAt))}` : '未设置到期时间'}</div>
        </div>
      </div>
      <div class="preview-stage">
        ${renderPreview(share.token, item)}
      </div>
    </div>
  `;
}

function renderPreview(token, item) {
  if (!item.allowPreview) {
    return renderEmptyState('预览已关闭', '当前分享仅允许下载，不开放在线预览。', icons.lock);
  }
  const src = `/api/share/${encodeURIComponent(token)}/preview`;
  const type = String(item.contentType || '').toLowerCase();
  if (type.startsWith('image/')) return `<img src="${src}" alt="${escapeHtml(item.name)}">`;
  if (type.startsWith('video/')) return `<video src="${src}" controls></video>`;
  if (type.startsWith('audio/')) return `<div class="empty-state"><audio src="${src}" controls style="width:min(520px,100%);"></audio></div>`;
  return `<iframe src="${src}" title="${escapeHtml(item.name)}"></iframe>`;
}

function renderInspector(selected, state) {
  if (!selected) {
    return `
      <div class="inspector-wrap">
        <div>
          <h3 class="inspector-title">侧边信息</h3>
          <p class="inspector-copy">选中一个文件或文件夹后，这里会显示它的路径、大小、更新时间与快捷操作。</p>
        </div>
        <div class="detail-card" style="flex:1; display:grid; place-items:center;">
          <div class="empty-state" style="min-height:260px; padding:0;">
            <div>
              <div class="empty-orb">${icons.folder}</div>
              <h4 class="empty-title" style="font-size:24px;">等待选择</h4>
              <p class="empty-copy" style="max-width:260px;">你可以点击任意项目查看详情，也可以直接进入目录或预览文件。</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const kind = selected.kind || inferKind(selected);
  const canPreview = kind !== 'folder' && !state.explorer.trashMode;
  const canDownload = kind !== 'folder' && !state.explorer.trashMode;
  const isFolder = kind === 'folder';
  const pathValue = state.explorer.trashMode ? selected.original_key : selected.fullKey || selected.path || selected.name;

  return `
    <div class="inspector-wrap">
      <div>
        <h3 class="inspector-title">已选资源</h3>
        <p class="inspector-copy">基于右侧操作面板，你可以快速进入目录、下载文件或在新标签页预览内容。</p>
      </div>
      <div class="detail-card">
        <div class="detail-key">名称</div>
        <div class="detail-value">${escapeHtml(selected.name || '未命名')}</div>
      </div>
      <div class="detail-list">
        <div class="detail-card">
          <div class="detail-key">路径</div>
          <div class="detail-value">${escapeHtml(pathValue || '/')}</div>
        </div>
        <div class="detail-card">
          <div class="detail-key">${state.explorer.trashMode ? '删除时间' : '最近时间'}</div>
          <div class="detail-value">${escapeHtml(formatTime(selected.trashedAt || selected.time || 0))}</div>
        </div>
        <div class="detail-card">
          <div class="detail-key">类型与大小</div>
          <div class="detail-value">${escapeHtml(kind)} · ${escapeHtml(selected.sizeFormatted || formatBytes(selected.rawSize || 0))}</div>
        </div>
      </div>
      <div class="btn-row" style="margin-top:auto;">
        ${
          state.explorer.trashMode
            ? `
              <button class="btn btn-primary" data-action="restore-trash" data-key="${escapeHtml(entryKey(selected))}"><span class="icon">${icons.restore}</span>恢复</button>
              <button class="btn btn-danger" data-action="delete-trash" data-key="${escapeHtml(entryKey(selected))}"><span class="icon">${icons.trash}</span>彻底删除</button>
              <button class="btn" data-action="clear-trash"><span class="icon">${icons.close}</span>清空回收站</button>
            `
            : `
              ${isFolder ? `<button class="btn btn-primary" data-action="open-entry" data-key="${escapeHtml(entryKey(selected))}"><span class="icon">${icons.folder}</span>进入目录</button>` : ''}
              ${canPreview ? `<button class="btn" data-action="preview-entry" data-key="${escapeHtml(entryKey(selected))}"><span class="icon">${icons.eye}</span>预览</button>` : ''}
              ${canDownload ? `<button class="btn btn-ghost" data-action="download-entry" data-key="${escapeHtml(entryKey(selected))}"><span class="icon">${icons.download}</span>下载</button>` : ''}
              ${!isFolder && state.app.role === 'admin' ? `<button class="btn" data-action="copy-direct-link" data-key="${escapeHtml(entryKey(selected))}"><span class="icon">${icons.link}</span>直链</button>` : ''}
              ${!isFolder && state.app.role === 'admin' ? `<button class="btn" data-action="open-share-modal" data-key="${escapeHtml(entryKey(selected))}"><span class="icon">${icons.share}</span>分享</button>` : ''}
              ${state.app.role === 'admin' ? `<button class="btn" data-action="open-rename-modal" data-key="${escapeHtml(entryKey(selected))}"><span class="icon">${icons.edit}</span>重命名</button>` : ''}
            `
        }
      </div>
    </div>
  `;
}

function renderBatchBar(state, selectedEntries) {
  return `
    <div class="batch-bar">
      <div class="status-main">
        <span class="status-dot"></span>
        <span>已选择 ${selectedEntries.length} 项，可以批量复制、移动或删除。</span>
      </div>
      <div class="btn-row">
        <button class="btn" data-action="copy-selected">
          <span class="icon">${icons.copy}</span>复制
        </button>
        <button class="btn" data-action="move-selected">
          <span class="icon">${icons.move}</span>移动
        </button>
        ${state.app.role === 'admin' ? `
          <button class="btn btn-danger" data-action="delete-selected">
            <span class="icon">${icons.trash}</span>删除
          </button>
        ` : ''}
        <button class="btn" data-action="clear-selected">取消选择</button>
      </div>
    </div>
  `;
}

function renderKindOptions(selected, trashMode) {
  const options = [
    ['all', '全部'],
    trashMode ? ['folder', '文件夹'] : null,
    ['image', '图片'],
    ['video', '视频'],
    ['audio', '音频'],
    ['pdf', 'PDF'],
    ['text', '文本'],
    ['archive', '压缩包'],
    ['file', '其他文件'],
  ].filter(Boolean);
  return options.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function renderCrumb(item) {
  return `
    <button class="crumb ${item.current ? 'is-current' : ''}" data-action="crumb" data-path="${escapeHtml(item.path)}">
      ${escapeHtml(item.label)}
    </button>
  `;
}

function buildBreadcrumbs(path) {
  const parts = normalizeKey(path).split('/').filter(Boolean);
  const crumbs = [{ label: '根目录', path: '', current: parts.length === 0 }];
  let current = '';
  parts.forEach((part, index) => {
    current = current ? `${current}/${part}` : part;
    crumbs.push({ label: part, path: current, current: index === parts.length - 1 });
  });
  return crumbs;
}

function renderEntryCard(item, state) {
  const key = entryKey(item);
  const selected = state.explorer.selectedKey === key;
  const picked = state.explorer.selectedKeys.includes(key);
  const kind = item.kind || inferKind(item);
  const isFolder = kind === 'folder';
  const meta = state.explorer.trashMode
    ? [`${item.kind === 'folder' ? '文件夹' : '文件'}`, formatTime(item.trashedAt || 0)]
    : [
        isFolder ? (item.virtual ? '虚拟目录' : '目录') : (item.sizeFormatted || formatBytes(item.rawSize || 0)),
        item.time ? formatRelative(item.time) : '待同步',
      ];

  return `
    <article class="item-card ${selected ? 'is-selected' : ''}" data-action="select-entry" data-key="${escapeHtml(key)}">
      <button class="item-pick ${picked ? 'is-active' : ''}" data-action="toggle-pick" data-key="${escapeHtml(key)}">
        ${picked ? icons.check : ''}
      </button>
      <div class="item-icon ${iconClass(kind)}">${iconForKind(kind)}</div>
      <div class="item-content">
        <h3 class="item-title">${escapeHtml(item.name || '未命名项目')}</h3>
        <div class="item-meta">
          ${meta.map(text => `<span class="item-chip">${escapeHtml(text)}</span>`).join('')}
        </div>
      </div>
      <div class="item-actions">
        ${
          state.explorer.trashMode
            ? `
              <button class="btn btn-small" data-action="restore-trash" data-key="${escapeHtml(key)}">恢复</button>
              <button class="btn btn-small btn-danger" data-action="delete-trash" data-key="${escapeHtml(key)}">彻底删除</button>
            `
            : isFolder
              ? `<button class="btn btn-small" data-action="open-entry" data-key="${escapeHtml(key)}">进入</button>`
              : `
                <button class="btn btn-small" data-action="preview-entry" data-key="${escapeHtml(key)}">预览</button>
                <button class="btn btn-small btn-ghost" data-action="download-entry" data-key="${escapeHtml(key)}">下载</button>
                ${state.app.role === 'admin' ? `<button class="btn btn-small" data-action="open-share-modal" data-key="${escapeHtml(key)}">分享</button>` : ''}
              `
        }
      </div>
    </article>
  `;
}

function renderEmptyState(title, copy, icon) {
  return `
    <div class="empty-state">
      <div>
        <div class="empty-orb">${icon}</div>
        <h3 class="empty-title">${escapeHtml(title)}</h3>
        <p class="empty-copy">${escapeHtml(copy)}</p>
      </div>
    </div>
  `;
}

function renderModal(state) {
  const modal = state.app.modal;
  if (!modal) return '';

  if (modal.type === 'login') {
    const values = modal.values || {};
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="login-title" data-stop-close="true">
          <h3 id="login-title" class="modal-title">管理员登录</h3>
          <p class="modal-copy">输入后台账号信息后，即可使用上传、新建目录、回收站与管理概览功能。</p>
          <form class="modal-form" data-form="login">
            <input class="inline-input" name="username" placeholder="用户名" value="${escapeHtml(values.username || '')}">
            <input class="inline-input" type="password" name="password" placeholder="密码" value="${escapeHtml(values.password || '')}">
            ${modal.error ? `<div class="error-text">${escapeHtml(modal.error)}</div>` : '<div class="helper-text">登录成功后会自动刷新当前页面的数据权限。</div>'}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-primary" type="submit" ${modal.loading ? 'disabled' : ''}>${modal.loading ? '登录中…' : '登录'}</button>
              <button class="btn" type="button" data-action="close-modal">取消</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  if (modal.type === 'folder') {
    const values = modal.values || {};
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="folder-title" data-stop-close="true">
          <h3 id="folder-title" class="modal-title">新建文件夹</h3>
          <p class="modal-copy">当前目录下会创建一个新的资源容器，你可以随后继续上传文件或整理层级。</p>
          <form class="modal-form" data-form="folder">
            <input class="inline-input" name="folderName" placeholder="例如：品牌素材 / 2026 归档" value="${escapeHtml(values.folderName || '')}">
            ${modal.error ? `<div class="error-text">${escapeHtml(modal.error)}</div>` : '<div class="helper-text">名称会直接作为目录路径的一部分，请尽量简洁清晰。</div>'}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-primary" type="submit">创建目录</button>
              <button class="btn" type="button" data-action="close-modal">取消</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  if (modal.type === 'rename') {
    const values = modal.values || {};
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="rename-title" data-stop-close="true">
          <h3 id="rename-title" class="modal-title">重命名资源</h3>
          <p class="modal-copy">新的名称会直接应用到当前文件或目录。请保持名称清晰，并避免与同层级项目重名。</p>
          <form class="modal-form" data-form="rename">
            <input class="inline-input" name="newName" placeholder="输入新的名称" value="${escapeHtml(values.newName || modal.entry?.name || '')}">
            ${modal.error ? `<div class="error-text">${escapeHtml(modal.error)}</div>` : '<div class="helper-text">重命名会保持当前路径层级不变，只修改当前项目名称。</div>'}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-primary" type="submit">确认重命名</button>
              <button class="btn" type="button" data-action="close-modal">取消</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  if (modal.type === 'share') {
    const values = modal.values || {};
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="share-title" data-stop-close="true">
          <h3 id="share-title" class="modal-title">创建分享链接</h3>
          <p class="modal-copy">你正在为 ${escapeHtml(modal.entry?.name || '当前文件')} 生成对外分享地址，可控制有效期、下载次数与访问密码。</p>
          <form class="modal-form" data-form="share">
            <div class="form-grid">
              <input class="inline-input" name="expiresInDays" type="number" min="0" max="3650" placeholder="有效期天数" value="${escapeHtml(values.expiresInDays || '7')}">
              <input class="inline-input" name="maxDownloads" type="number" min="0" max="1000000" placeholder="最大下载次数，0 为不限" value="${escapeHtml(values.maxDownloads || '0')}">
              <input class="inline-input" name="password" type="text" placeholder="访问密码，可留空" value="${escapeHtml(values.password || '')}">
              <label class="check-row"><input type="checkbox" name="allowPreview" ${values.allowPreview !== false ? 'checked' : ''}>允许在线预览</label>
              <label class="check-row"><input type="checkbox" name="allowDownload" ${values.allowDownload !== false ? 'checked' : ''}>允许下载文件</label>
            </div>
            ${modal.error ? `<div class="error-text">${escapeHtml(modal.error)}</div>` : '<div class="helper-text">创建成功后会自动复制分享链接到剪贴板。</div>'}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-primary" type="submit">生成分享</button>
              <button class="btn" type="button" data-action="close-modal">取消</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  if (modal.type === 'preview') {
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title" data-stop-close="true">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px;">
            <div>
              <h3 id="preview-title" class="modal-title">${escapeHtml(modal.entry?.name || '在线预览')}</h3>
              <p class="modal-copy">${escapeHtml(getEntryPath(modal.entry) || '')}</p>
            </div>
            <div class="btn-row">
              ${modal.editable ? `<button class="btn" data-action="toggle-preview-edit">${modal.editing ? '退出编辑' : '编辑文本'}</button>` : ''}
              ${modal.editable && modal.editing ? `<button class="btn btn-primary" data-action="save-preview-edit"><span class="icon">${icons.save}</span>保存</button>` : ''}
              <button class="btn" data-action="close-modal"><span class="icon">${icons.close}</span>关闭</button>
            </div>
          </div>
          <div class="preview-modal-body">
            ${renderPreviewModalBody(modal)}
          </div>
        </div>
      </div>
    `;
  }

  return '';
}

function renderPreviewModalBody(modal) {
  if (modal.loading) return `<div class="empty-state"><div><div class="empty-orb">${icons.refresh}</div><h3 class="empty-title">正在准备预览</h3><p class="empty-copy">正在读取文件内容，请稍候。</p></div></div>`;
  if (modal.error) return `<div class="empty-state"><div><div class="empty-orb">${icons.lock}</div><h3 class="empty-title">预览失败</h3><p class="empty-copy">${escapeHtml(modal.error)}</p></div></div>`;
  const path = encodeRouteKey(getEntryPath(modal.entry));
  if (modal.contentMode === 'image') return `<div class="preview-media-shell"><img src="/api/preview/${path}" alt="${escapeHtml(modal.entry?.name || '')}"></div>`;
  if (modal.contentMode === 'video') return `<div class="preview-media-shell"><video src="/api/preview/${path}" controls autoplay playsinline></video></div>`;
  if (modal.contentMode === 'audio') return `<div class="preview-media-shell"><audio src="/api/preview/${path}" controls autoplay style="width:min(560px,100%);"></audio></div>`;
  if (modal.contentMode === 'pdf') return `<div class="preview-media-shell"><iframe src="/api/preview/${path}" title="${escapeHtml(modal.entry?.name || '')}"></iframe></div>`;
  if (modal.editing) return `<textarea class="preview-editor" id="preview-edit-area">${escapeHtml(modal.content || '')}</textarea>`;
  return `<pre class="preview-text">${escapeHtml(modal.content || '')}</pre>`;
}

function renderToast(state) {
  if (!state.app.toast) return '';
  return `
    <div class="toast-wrap">
      <div class="toast" data-type="${escapeHtml(state.app.toast.type || 'info')}">${escapeHtml(state.app.toast.message || '')}</div>
    </div>
  `;
}

function openPreview(entry) {
  const key = encodeRouteKey(entry.fullKey || '');
  if (!key) return;
  window.open(`/api/preview/${key}`, '_blank', 'noopener');
}

function openDownload(entry) {
  const key = encodeRouteKey(entry.fullKey || '');
  if (!key) return;
  window.location.href = `/api/download/${key}`;
}

function findEntryByKey(key) {
  return currentEntries(store.getState()).find(item => entryKey(item) === key) || null;
}

document.addEventListener('click', event => {
  const stopClose = event.target.closest('[data-stop-close="true"]');
  const actionNode = event.target.closest('[data-action]');
  const state = store.getState();

  if (!actionNode && stopClose) return;

  if (actionNode) {
    const { action, key, path } = actionNode.dataset;

    if (action === 'open-login') {
      store.dispatch(actions.app.setModal({ type: 'login', loading: false, error: '', values: {} }));
      return;
    }

    if (action === 'close-modal' || action === 'close-modal-backdrop') {
      if (action === 'close-modal-backdrop' && stopClose) return;
      store.dispatch(actions.app.setModal(null));
      return;
    }

    if (action === 'logout') {
      store.dispatch(thunks.logout());
      return;
    }

    if (action === 'crumb') {
      store.dispatch(actions.explorer.setTrashMode(false));
      store.dispatch(actions.explorer.setPath(path || ''));
      store.dispatch(actions.explorer.setQuery(''));
      store.dispatch(actions.explorer.setQueryDraft(''));
      store.dispatch(thunks.loadExplorer());
      return;
    }

    if (action === 'refresh-explorer') {
      store.dispatch(thunks.loadExplorer());
      return;
    }

    if (action === 'refresh-admin') {
      store.dispatch(thunks.loadAdminStats());
      return;
    }

    if (action === 'upload') {
      const input = document.getElementById('upload-input');
      if (input) input.click();
      return;
    }

    if (action === 'upload-folder') {
      const input = document.getElementById('folder-upload-input');
      if (input) input.click();
      return;
    }

    if (action === 'open-folder-modal') {
      if (state.app.role !== 'admin') {
        dispatchToast('error', '请先登录管理员账户');
        return;
      }
      store.dispatch(actions.app.setModal({ type: 'folder', loading: false, error: '', values: {} }));
      return;
    }

    if (action === 'cycle-sort') {
      const next = state.explorer.sort === 'smart' ? 'time' : state.explorer.sort === 'time' ? 'size' : 'smart';
      store.dispatch(actions.explorer.setSort(next));
      render();
      return;
    }

    if (action === 'toggle-view') {
      store.dispatch(actions.explorer.setView(state.explorer.view === 'grid' ? 'list' : 'grid'));
      return;
    }

    if (action === 'toggle-trash') {
      const next = !state.explorer.trashMode;
      store.dispatch(actions.explorer.setTrashMode(next));
      store.dispatch(actions.explorer.setQuery(next ? state.explorer.query : ''));
      store.dispatch(actions.explorer.setPath(next ? state.explorer.path : state.explorer.path));
      store.dispatch(thunks.loadExplorer());
      return;
    }

    if (action === 'toggle-pick') {
      event.stopPropagation();
      const selected = new Set(state.explorer.selectedKeys);
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      store.dispatch(actions.explorer.setSelectedKeys([...selected]));
      return;
    }

    if (action === 'select-entry') {
      store.dispatch(actions.explorer.setSelection(key || ''));
      return;
    }

    if (action === 'clear-selected') {
      store.dispatch(actions.explorer.setSelectedKeys([]));
      return;
    }

    if (action === 'copy-selected' || action === 'move-selected') {
      const paths = state.explorer.selectedKeys
        .map(id => findEntryByKey(id))
        .filter(Boolean)
        .map(item => getEntryPath(item))
        .filter(Boolean);
      store.dispatch(actions.explorer.setClipboard({ action: action === 'move-selected' ? 'move' : 'copy', paths }));
      store.dispatch(actions.explorer.setSelectedKeys([]));
      dispatchToast('success', action === 'move-selected' ? '已加入移动列表' : '已加入复制列表');
      return;
    }

    if (action === 'clear-clipboard') {
      store.dispatch(actions.explorer.setClipboard(null));
      dispatchToast('success', '已清空剪贴板');
      return;
    }

    if (action === 'paste-clipboard') {
      store.dispatch(thunks.pasteClipboard());
      return;
    }

    if (action === 'delete-selected') {
      const paths = state.explorer.selectedKeys
        .map(id => findEntryByKey(id))
        .filter(Boolean)
        .map(item => getEntryPath(item))
        .filter(Boolean);
      store.dispatch(thunks.batchDelete(paths));
      return;
    }

    if (action === 'open-entry') {
      const entry = findEntryByKey(key);
      if (!entry) return;
      if ((entry.kind || inferKind(entry)) === 'folder') {
        store.dispatch(actions.explorer.setTrashMode(false));
        store.dispatch(actions.explorer.setPath(entry.fullKey || ''));
        store.dispatch(actions.explorer.setQuery(''));
        store.dispatch(actions.explorer.setQueryDraft(''));
        store.dispatch(thunks.loadExplorer());
      } else {
        store.dispatch(thunks.previewEntry(entry));
      }
      return;
    }

    if (action === 'preview-entry') {
      const entry = findEntryByKey(key);
      if (entry) store.dispatch(thunks.previewEntry(entry));
      return;
    }

    if (action === 'download-entry') {
      const entry = findEntryByKey(key);
      if (entry) openDownload(entry);
      return;
    }

    if (action === 'open-share-modal') {
      const entry = findEntryByKey(key);
      if (entry) store.dispatch(thunks.createShare(entry));
      return;
    }

    if (action === 'copy-direct-link') {
      const entry = findEntryByKey(key);
      if (!entry) return;
      copyText(`${window.location.origin}/api/preview/${encodeRouteKey(getEntryPath(entry))}`, '直链已复制');
      return;
    }

    if (action === 'open-rename-modal') {
      const entry = findEntryByKey(key);
      if (!entry) return;
      store.dispatch(actions.app.setModal({
        type: 'rename',
        loading: false,
        error: '',
        entry,
        values: { newName: entry.name || '' },
      }));
      return;
    }

    if (action === 'toggle-preview-edit') {
      const modal = state.app.modal;
      if (!modal || modal.type !== 'preview') return;
      store.dispatch(actions.app.setModal({ ...modal, editing: !modal.editing }));
      return;
    }

    if (action === 'save-preview-edit') {
      const area = document.getElementById('preview-edit-area');
      store.dispatch(thunks.savePreviewText(area?.value || ''));
      return;
    }

    if (action === 'restore-trash') {
      store.dispatch(thunks.restoreTrash(key));
      return;
    }

    if (action === 'delete-trash') {
      store.dispatch(thunks.deleteTrash(key));
      return;
    }

    if (action === 'clear-trash') {
      store.dispatch(thunks.clearTrash());
    }
  }
});

document.addEventListener('input', event => {
  const state = store.getState();
  const role = event.target.dataset.role;

  if (role === 'search-input') {
    const value = event.target.value;
    store.dispatch(actions.explorer.setQueryDraft(value));
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      store.dispatch(actions.explorer.setQuery(value.trim()));
      syncHomeUrl(state.explorer.path, value.trim());
      store.dispatch(thunks.loadExplorer());
    }, 260);
    return;
  }

  if (event.target.dataset.role === 'kind-filter') {
    store.dispatch(actions.explorer.setFilter(event.target.value));
    return;
  }

  if (event.target.name === 'password' && page === 'share') {
    store.dispatch(actions.share.setPassword(event.target.value));
  }
});

document.addEventListener('change', event => {
  if (event.target.id === 'upload-input') {
    if (store.getState().app.role !== 'admin') {
      dispatchToast('error', '请先登录管理员账户');
      event.target.value = '';
      return;
    }
    store.dispatch(thunks.uploadFiles(event.target.files));
    event.target.value = '';
    return;
  }

  if (event.target.id === 'folder-upload-input') {
    if (store.getState().app.role !== 'admin') {
      dispatchToast('error', '请先登录管理员账户');
      event.target.value = '';
      return;
    }
    store.dispatch(thunks.uploadFiles(event.target.files));
    event.target.value = '';
  }
});

document.addEventListener('submit', event => {
  const form = event.target.dataset.form;
  if (!form) return;
  event.preventDefault();
  const data = new FormData(event.target);

  if (form === 'login') {
    store.dispatch(thunks.login({
      username: String(data.get('username') || '').trim(),
      password: String(data.get('password') || ''),
    }));
    return;
  }

  if (form === 'folder') {
    store.dispatch(thunks.createFolder(String(data.get('folderName') || '')));
    return;
  }

  if (form === 'rename') {
    const modal = store.getState().app.modal;
    const path = modal?.entry ? getEntryPath(modal.entry) : '';
    store.dispatch(thunks.renameEntry(path, String(data.get('newName') || '').trim()));
    return;
  }

  if (form === 'share') {
    store.dispatch(thunks.submitShare({
      expiresInDays: String(data.get('expiresInDays') || '7'),
      maxDownloads: String(data.get('maxDownloads') || '0'),
      password: String(data.get('password') || ''),
      allowPreview: data.get('allowPreview') != null,
      allowDownload: data.get('allowDownload') != null,
    }));
    return;
  }

  if (form === 'share-password') {
    store.dispatch(thunks.unlockShare(String(data.get('password') || '')));
  }
});

store.subscribe(render);
render();

store.dispatch(actions.app.setNow(Date.now()));
store.dispatch(thunks.loadRole()).then(async () => {
  if (page === 'home') {
    await store.dispatch(thunks.loadExplorer());
  } else if (page === 'admin') {
    if (store.getState().app.role === 'admin') {
      await store.dispatch(thunks.loadAdminStats());
    }
  } else if (page === 'share') {
    await store.dispatch(thunks.loadShare());
  }
});
