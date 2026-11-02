import { cfg, save, update, clear, exportAll, importAll } from './store.js';
import { instagram, relay, NETWORKS, youtube, tiktok } from './platforms.js';
import { hasRelay } from './net.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const NETS = [
  { id: 'tiktok',   name: 'TikTok',   color: '#111',    ab: 'TT', video: true },
  { id: 'x',        name: 'X',        color: '#000',    ab: 'X',  short: true, limit: 280 },
  { id: 'threads',  name: 'Threads',  color: '#333',    ab: '@',  short: true, limit: 500 },
  { id: 'facebook', name: 'Facebook', color: '#1877f2', ab: 'f' },
  { id: 'bluesky',  name: 'Bluesky',  color: '#1185fe', ab: 'bs', short: true, limit: 300 },
  { id: 'youtube',  name: 'YouTube',  color: '#ff0000', ab: '▶', video: true },
];
const netName = (id) => (NETS.find((n) => n.id === id) || { name: id }).name;
const S = { status: {}, posts: [], next: null, current: null, busy: false };
const selected = () => new Set(cfg().selected);
const setSelected = (set) => { cfg().selected = [...set]; save(); };

function toast(t) {
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d);
  setTimeout(() => d.remove(), 2600);
}

/* ---------------- routing ---------------- */
function route() {
  const v = location.hash === '#settings' ? 'settings' : 'posts';
  document.querySelectorAll('.view').forEach((el) => (el.hidden = el.id !== `view-${v}`));
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.dataset.view === v));
  if (v === 'settings') renderSettings();
}
window.addEventListener('hashchange', route);

/* ---------------- status ---------------- */
async function loadStatus() {
  const checks = { instagram, relay, ...NETWORKS };
  const entries = await Promise.all(Object.entries(checks).map(async ([k, mod]) => {
    try { return [k, { ok: true, name: await mod.whoami() }]; }
    catch (e) { return [k, { ok: false, error: e.message }]; }
  }));
  S.status = Object.fromEntries(entries);
  S.status.x = { ok: true, name: 'Free compose window' };
  $('#who').textContent = S.status.instagram.ok ? `Instagram: ${S.status.instagram.name}` : '';
}

/* ---------------- posts grid ---------------- */
async function loadPosts(more) {
  const grid = $('#grid'); const msg = $('#postsMsg');
  if (!more) { grid.innerHTML = '<div class="skeleton"></div>'.repeat(8); msg.classList.remove('show'); $('#more').hidden = true; }
  try {
    if (!more) await instagram.maybeRefresh();
    const r = await instagram.list(more ? S.next : undefined);
    if (!more) { grid.innerHTML = ''; S.posts = []; }
    S.posts.push(...r.posts); S.next = r.next;
    r.posts.forEach(addTile);
    $('#more').hidden = !S.next;
    if (!S.posts.length) { msg.textContent = 'No posts found on this Instagram account yet.'; msg.classList.add('show'); }
  } catch (e) {
    grid.innerHTML = '';
    msg.innerHTML = /not set up/.test(e.message)
      ? `<strong>Welcome!</strong> Connect your Instagram so your posts show up here. <a href="#settings">Go to Settings →</a>`
      : `Couldn't load your posts: ${esc(e.message)}. <a href="#settings">Check Settings →</a>`;
    msg.classList.add('show');
  }
}
function addTile(p) {
  const b = document.createElement('button'); b.className = 'tile';
  const badge = p.kind === 'REEL' ? 'Reel' : p.kind === 'VIDEO' ? 'Video' : p.kind === 'CAROUSEL' ? `${p.items.length} items` : '';
  b.innerHTML = `<img loading="lazy" alt="" referrerpolicy="no-referrer" src="${esc(p.thumb)}">${badge ? `<span class="badge">${badge}</span>` : ''}<span class="cap">${esc(p.caption || 'No caption')}</span>`;
  b.onclick = () => openPanel(p);
  $('#grid').appendChild(b);
}
$('#more').onclick = () => loadPosts(true);

function renderHistory() {
  const h = cfg().history;
  $('#history').innerHTML = h.length ? h.slice(0, 10).map((x) => `<div class="h-item"><img src="${esc(x.thumb)}" referrerpolicy="no-referrer" alt="">
    <div style="min-width:0"><div class="t">${new Date(x.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>
    <div class="c">${esc(x.caption || '(no caption)')}</div>
    <div class="t">${x.results.map((r) => `${r.ok ? '✓' : '✗'} ${netName(r.network)}`).join(' · ')}</div></div></div>`).join('')
    : '<div class="muted" style="font-size:14px">Nothing sent yet.</div>';
}

/* ---------------- post panel ---------------- */
function openPanel(p) {
  S.current = p;
  $('#pMedia').innerHTML = p.items.map((it) => it.type === 'VIDEO'
    ? `<video src="${esc(it.url)}" poster="${esc(it.thumb)}" controls playsinline preload="metadata"></video>`
    : `<img src="${esc(it.url)}" referrerpolicy="no-referrer" alt="">`).join('');
  $('#pMeta').innerHTML = `${new Date(p.timestamp).toLocaleDateString([], { dateStyle: 'medium' })} · ${p.items.length > 1 ? `${p.items.length} items` : p.kind.toLowerCase()} · <a href="${esc(p.permalink)}" target="_blank" rel="noopener">view on Instagram</a>`;
  $('#pCaption').value = p.caption; $('#pShort').value = ''; $('#pResults').innerHTML = '';
  renderNets(); renderOpts(); validate();
  $('#scrim').hidden = false; $('#panel').hidden = false; $('#panel').scrollTop = 0;
}
function closePanel() { if (S.busy) return; $('#scrim').hidden = true; $('#panel').hidden = true; $('#pMedia').innerHTML = ''; }
$('#closePanel').onclick = closePanel; $('#scrim').onclick = closePanel;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

const hasVideo = () => S.current?.items.some((i) => i.type === 'VIDEO');
function usable(n) {
  const st = S.status[n.id];
  if (!st?.ok) return { ok: false, why: 'Not set up — see Settings' };
  if (n.video && !hasVideo()) return { ok: false, why: 'Needs a video post' };
  return { ok: true, why: st.name };
}
function renderNets() {
  const box = $('#pNets'); box.innerHTML = ''; const sel = selected();
  NETS.forEach((n) => {
    const u = usable(n); const on = u.ok && sel.has(n.id);
    const el = document.createElement('label');
    el.className = 'net' + (on ? ' on' : '') + (u.ok ? '' : ' dis');
    el.innerHTML = `<input type="checkbox" ${on ? 'checked' : ''} ${u.ok ? '' : 'disabled'}><span class="ico" style="background:${n.color}">${n.ab}</span><span><div class="nm">${n.name}</div><div class="st">${esc(u.why)}</div></span>`;
    el.querySelector('input').onchange = (e) => {
      const s = selected(); e.target.checked ? s.add(n.id) : s.delete(n.id); setSelected(s);
      renderNets(); renderOpts(); validate();
    };
    box.appendChild(el);
  });
}
const active = () => { const s = selected(); return NETS.filter((n) => usable(n).ok && s.has(n.id)); };

function renderOpts() {
  const ids = active().map((n) => n.id); let h = '';
  if (ids.includes('youtube')) h += `<label>YouTube</label><input type="text" id="oYtTitle" placeholder="Title (optional — uses the first line of the caption)">
    <div class="opt-row"><select id="oYtPrivacy"><option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option></select></div>`;
  if (ids.includes('tiktok') && cfg().tiktok.directPost) h += `<label>TikTok visibility</label><select id="oTtPrivacy">
    <option value="PUBLIC_TO_EVERYONE">Public</option><option value="FOLLOWER_OF_CREATOR">Followers</option><option value="MUTUAL_FOLLOW_FRIENDS">Friends</option><option value="SELF_ONLY">Only me</option></select>`;
  $('#pOpts').innerHTML = h;
}

const len = (s) => [...s].length;
function textFor(n) { const s = $('#pShort').value.trim(); return n.short && s ? s : $('#pCaption').value.trim(); }
function validate() {
  const cap = $('#pCaption').value, sh = $('#pShort').value;
  $('#pCount').textContent = `${len(cap)} characters`;
  $('#pShortCount').innerHTML = sh ? `<span class="${len(sh) > 280 ? 'bad' : ''}">${len(sh)} / 280</span>` : '';
  const probs = []; const act = active();
  if (!act.length) probs.push('Pick at least one place to post.');
  act.forEach((n) => { if (n.limit && len(textFor(n)) > n.limit) probs.push(`${n.name} allows ${n.limit} characters — write a short version under the caption.`); });
  $('#pProblems').innerHTML = probs.map((p) => `<li>${esc(p)}</li>`).join('');
  const b = $('#pGo'); b.disabled = !!probs.length || S.busy;
  b.textContent = S.busy ? 'Posting…' : act.length ? `Post to ${act.map((n) => n.name).join(', ')}` : 'Post';
}
['#pCaption', '#pShort'].forEach((s) => $(s).addEventListener('input', validate));

function resRow(id, cls, status, msg, actions = '') {
  return `<div class="res ${cls}" data-net="${id}"><div class="top-line"><strong>${netName(id)}</strong><span class="s">${esc(status)}</span></div>${msg ? `<div class="m">${msg}</div>` : ''}${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
}
function mediaLinks(p) {
  return p.items.map((it, i) => `<a class="btn sm" href="${esc(it.url)}" target="_blank" rel="noopener">Open ${it.type === 'VIDEO' ? 'video' : 'photo'}${p.items.length > 1 ? ' ' + (i + 1) : ''} to save</a>`).join('');
}

$('#pGo').onclick = () => {
  if (S.busy) return;
  const p = S.current; const act = active(); const ids = act.map((n) => n.id);
  const out = $('#pResults'); out.innerHTML = '';
  const caption = $('#pCaption').value, short = $('#pShort').value.trim();
  const options = { youtubeTitle: $('#oYtTitle')?.value, youtubePrivacy: $('#oYtPrivacy')?.value, tiktokPrivacy: $('#oTtPrivacy')?.value };

  // Anything that opens a window must happen right now, inside the click.
  if (ids.includes('x')) {
    window.open('https://x.com/intent/post?text=' + encodeURIComponent(textFor(NETS[1])), '_blank', 'noopener');
    out.insertAdjacentHTML('beforeend', resRow('x', 'ok', 'Compose window opened',
      p.items.length ? 'Save the media below, attach it in the X window, then click Post. (X charges for automatic posting through its API, so this step is manual.)' : 'Click Post in the X window.',
      p.items.length ? mediaLinks(p) : ''));
  }
  const ytReady = ids.includes('youtube') && !youtube.hasToken() ? youtube.signIn() : Promise.resolve();

  const server = ids.filter((id) => id !== 'x');
  const record = (results) => {
    cfg().history.unshift({ at: Date.now(), thumb: p.thumb, caption: caption.slice(0, 120), results });
    cfg().history = cfg().history.slice(0, 50); save(); renderHistory();
  };
  if (!server.length) { record([{ network: 'x', ok: true }]); return; }

  server.forEach((id) => out.insertAdjacentHTML('beforeend', resRow(id, 'wait', 'Sending…', id === 'tiktok' || id === 'youtube' ? 'Uploading video — this can take a minute. Keep this tab open.' : '')));
  S.busy = true; validate();

  (async () => {
    let fresh;
    try { fresh = await instagram.get(p.id); } catch { fresh = p; } // media links expire; get fresh ones
    const results = await Promise.all(server.map(async (id) => {
      const n = NETS.find((x) => x.id === id);
      const text = n.short && short ? short : caption.trim();
      try {
        if (id === 'youtube') await ytReady;
        const r = await NETWORKS[id].publish(fresh, text, options);
        const actions = (r.url ? `<a class="btn sm" href="${esc(r.url)}" target="_blank" rel="noopener">View</a>` : '') + (r.copyCaption ? `<button class="btn sm" data-copy>Copy caption</button>` : '');
        out.querySelector(`[data-net="${id}"]`).outerHTML = resRow(id, 'ok', 'Done', esc(r.message), actions);
        return { network: id, ok: true };
      } catch (e) {
        out.querySelector(`[data-net="${id}"]`).outerHTML = resRow(id, 'err', 'Failed', esc(e.message));
        return { network: id, ok: false };
      }
    }));
    out.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = async () => {
      try { await navigator.clipboard.writeText(caption); toast('Caption copied'); } catch { toast('Copy failed — select the caption and copy it'); }
    }));
    record(ids.includes('x') ? results.concat([{ network: 'x', ok: true }]) : results);
    S.busy = false; validate();
  })();
};

/* ---------------- settings ---------------- */
const RELAY_NOTE = '<div class="note">⚠️ Needs the free relay (set up below).</div>';
function guides() {
  const site = tiktok.redirectUri(); const origin = youtube.origin();
  return {
    instagram: {
      title: 'Instagram', color: '#d62976', ab: 'IG', role: 'Where your posts come from',
      steps: `<ol>
        <li>In the Instagram app, switch to a <strong>Professional account</strong> (Creator or Business) — Settings → Account type and tools. It's free.</li>
        <li>Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a> → <strong>Create app</strong>. Choose the use case <em>“Manage messaging &amp; content on Instagram”</em>.</li>
        <li>Open that use case → <strong>API setup with Instagram login</strong> → <strong>Add account</strong> and log in to your Instagram.</li>
        <li>Click <strong>Generate token</strong> next to your account, copy it, and paste it below.</li></ol>`,
      note: 'The token lasts 60 days; Crosspost renews it each week while you use it.',
      fields: [['accessToken', 'Access token', 'password']],
    },
    relay: {
      title: 'Free relay', color: '#f38020', ab: '⇄', role: 'Needed for TikTok, YouTube and Bluesky photos',
      steps: `<ol>
        <li>Make a free account at <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noopener">cloudflare.com</a>.</li>
        <li>Go to <strong>Workers &amp; Pages → Create → Create Worker</strong> (start from “Hello World”), name it <code>crosspost-relay</code>, and <strong>Deploy</strong>.</li>
        <li>Click <strong>Edit code</strong>, delete everything, paste the code from <a href="https://github.com/nrsmith2550/crosspost/blob/main/worker/relay.js" target="_blank" rel="noopener">worker/relay.js</a>, and <strong>Deploy</strong>.</li>
        <li>In the Worker's <strong>Settings → Variables and Secrets</strong>, add a <strong>Secret</strong> named <code>RELAY_KEY</code> with any long password (use the one below), and a <strong>Text</strong> variable <code>ALLOWED_ORIGIN</code> = <code>${esc(origin)}</code>.</li>
        <li>Paste the Worker's address (like <code>https://crosspost-relay.yourname.workers.dev</code>) and the same key below.</li></ol>
        <p style="font-size:13px">A random key you can use: <code id="genKey"></code> <button class="btn sm" id="useKey" type="button">Use it</button></p>`,
      note: 'Browsers aren’t allowed to talk to TikTok or download Instagram’s video files directly, so the page sends those requests through your own relay. Cloudflare’s free plan covers far more than you’ll need.',
      fields: [['url', 'Relay address', 'text'], ['key', 'Relay key', 'password']],
    },
    tiktok: {
      title: 'TikTok', color: '#111', ab: 'TT', role: 'Videos only',
      steps: `<ol>
        <li>Go to <a href="https://developers.tiktok.com/apps" target="_blank" rel="noopener">developers.tiktok.com</a> → <strong>Manage apps</strong> → <strong>Connect an app</strong>. For the website/terms/privacy fields you can use <code>${esc(site)}</code>.</li>
        <li>Switch the app to <strong>Sandbox</strong> and add your own TikTok account under <strong>Target users</strong>, so you can use it without waiting for TikTok's review.</li>
        <li>Add products <strong>Login Kit</strong> and <strong>Content Posting API</strong>. Under Platforms choose <strong>Web</strong>.</li>
        <li>In Login Kit, add this <strong>Redirect URI</strong>: <code>${esc(site)}</code></li>
        <li>Make sure scopes <code>user.info.basic</code> and <code>video.upload</code> are on.</li>
        <li>Paste the <strong>Client key</strong> and <strong>Client secret</strong> below, Save, then click <strong>Connect TikTok</strong>.</li></ol>`,
      note: 'Videos go to your TikTok inbox as drafts — TikTok notifies you; tap it, paste the caption, and Post. (Posting directly needs TikTok to approve your app; until then TikTok makes those posts private.)',
      fields: [['clientKey', 'Client key', 'text'], ['clientSecret', 'Client secret', 'password']],
      extra: `<label class="check"><input type="checkbox" id="ttDirect"> My app passed TikTok's review — post directly instead of to my inbox</label>`,
      needsRelay: true, connect: 'tiktok',
    },
    threads: {
      title: 'Threads', color: '#333', ab: '@', role: 'Photos, videos, carousels',
      steps: `<ol>
        <li>In your Meta app (the same one as Instagram is fine) click <strong>Add use case</strong> → <em>“Access the Threads API”</em> with permissions <code>threads_basic</code> and <code>threads_content_publish</code>.</li>
        <li><strong>App roles</strong> → add your Threads account as a <strong>Threads Tester</strong>, then accept the invite in Threads (Settings → Account → Website permissions → Invites).</li>
        <li>Generate a user access token for that account (in the Threads use case settings, or with the Graph API Explorer pointed at <code>graph.threads.net</code>) and paste it below.</li></ol>`,
      note: 'Threads allows 500 characters — use the short-version box for long captions.',
      fields: [['accessToken', 'Access token', 'password']],
    },
    facebook: {
      title: 'Facebook Page', color: '#1877f2', ab: 'f', role: 'Posts to a Page you manage',
      steps: `<ol>
        <li>Open the <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noopener">Graph API Explorer</a> and select your Meta app.</li>
        <li>Add permissions <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_posts</code>, then <strong>Generate Access Token</strong>.</li>
        <li>Make it last: in the <a href="https://developers.facebook.com/tools/debug/accesstoken/" target="_blank" rel="noopener">Access Token Debugger</a> paste the token, click <strong>Extend Access Token</strong>, and use that long-lived token back in the Explorer.</li>
        <li>Run <code>me/accounts</code> in the Explorer. Copy your Page's <code>id</code> and <code>access_token</code> below.</li></ol>`,
      note: 'Page tokens made from a long-lived token don’t expire. Facebook only allows posting to Pages, not personal profiles.',
      fields: [['pageId', 'Page ID', 'text'], ['pageToken', 'Page access token', 'password']],
    },
    bluesky: {
      title: 'Bluesky', color: '#1185fe', ab: 'bs', role: 'Up to 4 photos',
      steps: `<ol><li>In Bluesky go to <strong>Settings → Privacy and security → App passwords → Add App Password</strong>.</li>
        <li>Paste your handle (like <code>you.bsky.social</code>) and the app password below.</li></ol>`,
      note: 'Bluesky allows 300 characters and images up to about 1 MB. Video posts are shared as a link to the Instagram post. Photo posts may need the relay.',
      fields: [['handle', 'Handle', 'text'], ['appPassword', 'App password', 'password']],
    },
    youtube: {
      title: 'YouTube', color: '#ff0000', ab: '▶', role: 'Videos as Shorts',
      steps: `<ol>
        <li>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">console.cloud.google.com</a>, create a project, and enable <strong>YouTube Data API v3</strong>.</li>
        <li>Set up the <strong>OAuth consent screen</strong> (External) and add your Google account as a <strong>Test user</strong>.</li>
        <li><strong>Credentials → Create credentials → OAuth client ID → Web application</strong>. Under <strong>Authorized JavaScript origins</strong> add <code>${esc(origin)}</code>.</li>
        <li>Paste the <strong>Client ID</strong> below (no secret needed), Save, then click <strong>Connect YouTube</strong>.</li></ol>`,
      note: 'Google asks you to confirm in a quick pop-up about once an hour when you post. The free quota allows about 6 uploads a day, and YouTube may keep uploads private until your Google project passes Google’s API audit.',
      fields: [['clientId', 'Client ID', 'text']],
      needsRelay: true, connect: 'youtube',
    },
  };
}

async function renderSettings() {
  const box = $('#settings');
  box.innerHTML = '<div class="muted">Checking your connections…</div>';
  await loadStatus();
  box.innerHTML = '';
  for (const [sec, g] of Object.entries(guides())) {
    const st = S.status[sec] || {}; const vals = cfg()[sec];
    const card = document.createElement('div'); card.className = 's-card';
    const configured = g.fields.some(([k]) => vals[k]);
    card.innerHTML = `<div class="s-head"><span class="net" style="border:0;padding:0;cursor:default"><span class="ico" style="background:${g.color}">${g.ab}</span></span>
        <div><h3>${g.title}</h3><div class="muted" style="font-size:12.5px">${g.role}</div></div>
        <span class="pill ${st.ok ? 'ok' : ''}">${st.ok ? esc(st.name) : 'Not connected'}</span></div>
      <details ${st.ok ? '' : 'open'}><summary>How to set it up</summary>${g.steps}</details>
      ${g.fields.map(([k, label, type]) => `<label>${label}</label><input type="${type}" data-k="${k}" value="${esc(vals[k])}" autocomplete="off" spellcheck="false">`).join('')}
      ${g.extra || ''}
      <div class="note">${g.note}</div>
      ${g.needsRelay && !hasRelay() ? RELAY_NOTE : ''}
      ${!st.ok && configured && st.error ? `<div class="err">${esc(st.error)}</div>` : ''}
      <div class="s-actions"><button class="btn dark" data-save>Save</button>
        ${g.connect ? `<button class="btn" data-connect>${st.ok ? 'Reconnect' : 'Connect'} ${g.title}</button>` : ''}
        ${configured ? `<button class="btn" data-disc>Remove</button>` : ''}</div>`;
    if (sec === 'tiktok') $('#ttDirect', card).checked = !!vals.directPost;
    if (sec === 'relay') {
      const k = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('');
      $('#genKey', card).textContent = k;
      $('#useKey', card).onclick = () => { $('input[data-k="key"]', card).value = k; $('input[data-k="key"]', card).type = 'text'; };
    }
    $('[data-save]', card).onclick = () => {
      const v = {}; card.querySelectorAll('input[data-k]').forEach((i) => (v[i.dataset.k] = i.value.trim()));
      if (sec === 'tiktok') v.directPost = $('#ttDirect', card).checked;
      if (sec === 'instagram') v.refreshedAt = 0;
      update(sec, v); toast(`${g.title} saved`); renderSettings();
      if (sec === 'instagram') loadPosts();
    };
    const c = $('[data-connect]', card);
    if (c) c.onclick = async () => {
      const v = {}; card.querySelectorAll('input[data-k]').forEach((i) => (v[i.dataset.k] = i.value.trim()));
      if (sec === 'tiktok') v.directPost = $('#ttDirect', card).checked;
      update(sec, v);
      try {
        if (sec === 'tiktok') return tiktok.connect();
        await youtube.signIn(); toast('YouTube connected'); renderSettings();
      } catch (e) { toast(e.message); }
    };
    const d = $('[data-disc]', card);
    if (d) d.onclick = () => {
      clear(sec, Object.keys(vals)); toast(`${g.title} removed`); renderSettings();
    };
    box.appendChild(card);
  }
  box.insertAdjacentHTML('beforeend', `<div class="s-card"><div class="s-head"><span class="net" style="border:0;padding:0"><span class="ico" style="background:#000">X</span></span>
    <div><h3>X</h3><div class="muted" style="font-size:12.5px">No setup needed</div></div><span class="pill ok">Ready</span></div>
    <div class="note" style="font-size:13.5px">X charges for every post made through its API, so Crosspost opens X's free compose window with your caption filled in. You attach the photo or video and click Post.</div></div>
    <div class="s-card"><div class="s-head"><div><h3>Use on another device</h3><div class="muted" style="font-size:12.5px">Settings live in this browser only</div></div></div>
    <div class="note" style="font-size:13.5px">Copy this backup code and paste it into Crosspost on your other device. Treat it like a password: it contains your keys.</div>
    <div class="s-actions"><button class="btn" id="copyBackup">Copy backup code</button></div>
    <label>Paste a backup code</label><input type="password" id="backupIn" autocomplete="off">
    <div class="s-actions"><button class="btn dark" id="restore">Restore</button></div></div>`);
  $('#copyBackup').onclick = async () => { try { await navigator.clipboard.writeText(exportAll()); toast('Backup code copied'); } catch { toast("Couldn't copy"); } };
  $('#restore').onclick = () => { try { importAll($('#backupIn').value); toast('Settings restored'); renderSettings(); loadPosts(); } catch (e) { toast(e.message); } };
}

/* ---------------- start ---------------- */
(async function init() {
  youtube.preload();
  // Coming back from TikTok sign-in?
  const q = Object.fromEntries(new URLSearchParams(location.search));
  if (q.state?.startsWith('tt_')) {
    history.replaceState(null, '', location.pathname + '#settings');
    try { await tiktok.finishConnect(q); toast('TikTok connected'); }
    catch (e) { toast(`Couldn't connect TikTok: ${e.message}`); }
  }
  route();
  renderHistory();
  await loadStatus();
  loadPosts();
})();
