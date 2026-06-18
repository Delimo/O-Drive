import fs from 'node:fs';

const file = 'public/index.js';
let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

function findIdx(pred, from = 0) {
  for (let i = from; i < lines.length; i++) if (pred(lines[i])) return i;
  return -1;
}

// 1) Remove icons object: `const ICONS_REMOVED = {` ... first `};`
const iconStart = findIdx(l => l.trim() === 'const ICONS_REMOVED = {');
if (iconStart === -1) { console.error('icons start not found'); process.exit(1); }
const iconEnd = findIdx(l => l.trim() === '};', iconStart);
if (iconEnd === -1) { console.error('icons end not found'); process.exit(1); }
// sanity: block must contain the close icon svg
if (!lines.slice(iconStart, iconEnd + 1).some(l => l.includes('M6 6 18 18'))) {
  console.error('icons block sanity failed'); process.exit(1);
}
// drop trailing blank after the block too
let iconRemoveEnd = iconEnd;
if (lines[iconEnd + 1] !== undefined && lines[iconEnd + 1].trim() === '') iconRemoveEnd = iconEnd + 1;
lines = [...lines.slice(0, iconStart), ...lines.slice(iconRemoveEnd + 1)];

// 2) Remove inline store block: `const initialState = {` ... the `);` closing createStore,
//    replace with the factory call.
const storeStart = findIdx(l => l.trim() === 'const initialState = {');
if (storeStart === -1) { console.error('store start not found'); process.exit(1); }
const createStoreLine = findIdx(l => l.trim() === 'const store = createStore(', storeStart);
if (createStoreLine === -1) { console.error('createStore call not found'); process.exit(1); }
// the closing `);` is the first standalone `);` after createStoreLine
const storeEnd = findIdx(l => l.trim() === ');', createStoreLine);
if (storeEnd === -1) { console.error('store end not found'); process.exit(1); }
// sanity: block should contain combineReducers
if (!lines.slice(storeStart, storeEnd + 1).some(l => l.includes('combineReducers'))) {
  console.error('store block sanity failed'); process.exit(1);
}
const replacement = ['const { store, actions } = createRootStore({ page });'];
lines = [...lines.slice(0, storeStart), ...replacement, ...lines.slice(storeEnd + 1)];

let out = lines.join('\n');
if (!out.endsWith('\n')) out += '\n';
fs.writeFileSync(file, out);
console.log(`done. index.js now ${lines.length} lines`);
