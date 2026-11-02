// Everything is saved in this browser only (localStorage). Nothing is stored on GitHub.
const KEY = 'crosspost:v1';
const SECTIONS = ['instagram', 'tiktok', 'threads', 'facebook', 'bluesky', 'youtube', 'relay'];

let mem = null;

export function cfg() {
  if (mem) return mem;
  try { mem = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { mem = {}; }
  for (const s of SECTIONS) mem[s] = mem[s] || {};
  mem.history = mem.history || [];
  mem.selected = mem.selected || ['tiktok', 'x'];
  return mem;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cfg())); }
  catch { console.warn('Could not save settings in this browser'); }
}

export function update(section, values) {
  const c = cfg();
  c[section] = { ...c[section], ...values };
  save();
  return c[section];
}

export function clear(section, keys) {
  const c = cfg();
  for (const k of keys) delete c[section][k];
  save();
}

// Backup / move to another device
export function exportAll() {
  const c = { ...cfg() };
  delete c.history;
  return btoa(unescape(encodeURIComponent(JSON.stringify(c))));
}
export function importAll(code) {
  const data = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
  if (typeof data !== 'object' || !data) throw new Error('That backup code is not valid');
  const keepHistory = cfg().history;
  mem = { ...data, history: keepHistory };
  for (const s of SECTIONS) mem[s] = mem[s] || {};
  save();
}
