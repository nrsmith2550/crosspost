// All platform integrations, running in your browser.
import { cfg, update } from './store.js';
import { ApiError, call, getJson, postForm, postJson, fetchMedia, sleep } from './net.js';

const SITE = () => location.origin + location.pathname.replace(/index\.html$/, '');

/* =================== Instagram (source) =================== */
const IG = 'https://graph.instagram.com';
const IG_FIELDS = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_type,media_url,thumbnail_url}';

const igToken = () => {
  const t = cfg().instagram.accessToken;
  if (!t) throw new ApiError('Instagram', 'not set up yet — add your Instagram token in Settings');
  return t;
};

function normalize(m) {
  const items = (m.media_type === 'CAROUSEL_ALBUM' && m.children?.data?.length)
    ? m.children.data.map((c) => ({ type: c.media_type, url: c.media_url, thumb: c.thumbnail_url || c.media_url }))
    : [{ type: m.media_type, url: m.media_url, thumb: m.thumbnail_url || m.media_url }];
  return {
    id: m.id, caption: m.caption || '', permalink: m.permalink, timestamp: m.timestamp,
    kind: m.media_type === 'CAROUSEL_ALBUM' ? 'CAROUSEL' : m.media_product_type === 'REELS' ? 'REEL' : m.media_type,
    thumb: m.thumbnail_url || m.media_url || items[0]?.thumb,
    items: items.filter((i) => i.url),
  };
}

export const instagram = {
  async whoami() {
    const me = await getJson('Instagram', `${IG}/me?fields=user_id,username&access_token=${encodeURIComponent(igToken())}`);
    return `@${me.username}`;
  },
  async maybeRefresh() {
    const ig = cfg().instagram;
    if (!ig.accessToken || Date.now() - (ig.refreshedAt || 0) < 7 * 864e5) return;
    try {
      const r = await getJson('Instagram', `${IG}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(ig.accessToken)}`);
      update('instagram', { accessToken: r.access_token || ig.accessToken, refreshedAt: Date.now() });
    } catch { update('instagram', { refreshedAt: Date.now() }); }
  },
  async list(after) {
    const u = new URL(`${IG}/me/media`);
    u.searchParams.set('fields', IG_FIELDS);
    u.searchParams.set('limit', '24');
    if (after) u.searchParams.set('after', after);
    u.searchParams.set('access_token', igToken());
    const r = await getJson('Instagram', u.toString());
    return { posts: (r.data || []).map(normalize), next: r.paging?.next ? r.paging.cursors?.after : null };
  },
  async get(id) {
    return normalize(await getJson('Instagram', `${IG}/${encodeURIComponent(id)}?fields=${encodeURIComponent(IG_FIELDS)}&access_token=${encodeURIComponent(igToken())}`));
  },
};

/* =================== Threads =================== */
const TH = 'https://graph.threads.net/v1.0';
const thToken = () => {
  const t = cfg().threads.accessToken;
  if (!t) throw new ApiError('Threads', 'not set up yet — add your Threads token in Settings');
  return t;
};
async function thCreate(params) { return (await postForm('Threads', `${TH}/me/threads`, { ...params, access_token: thToken() })).id; }
async function thWait(id) {
  for (let i = 0; i < 60; i++) {
    const s = await getJson('Threads', `${TH}/${id}?fields=status,error_message&access_token=${encodeURIComponent(thToken())}`);
    if (s.status === 'FINISHED' || s.status === 'PUBLISHED') return;
    if (s.status === 'ERROR' || s.status === 'EXPIRED') throw new ApiError('Threads', s.error_message || 'media processing failed');
    await sleep(5000);
  }
  throw new ApiError('Threads', 'media took too long to process');
}
export const threads = {
  limit: 500,
  async whoami() {
    const me = await getJson('Threads', `${TH}/me?fields=id,username&access_token=${encodeURIComponent(thToken())}`);
    return `@${me.username}`;
  },
  async publish(post, text) {
    if ([...text].length > 500) throw new ApiError('Threads', 'caption is over 500 characters — write a short version');
    const items = post.items.slice(0, 20);
    let id;
    if (items.length > 1) {
      const kids = [];
      for (const it of items) kids.push(await thCreate(it.type === 'VIDEO'
        ? { media_type: 'VIDEO', video_url: it.url, is_carousel_item: 'true' }
        : { media_type: 'IMAGE', image_url: it.url, is_carousel_item: 'true' }));
      for (const k of kids) await thWait(k);
      id = await thCreate({ media_type: 'CAROUSEL', children: kids.join(','), text });
    } else if (items.length === 1) {
      const it = items[0];
      id = await thCreate(it.type === 'VIDEO' ? { media_type: 'VIDEO', video_url: it.url, text } : { media_type: 'IMAGE', image_url: it.url, text });
    } else {
      id = await thCreate({ media_type: 'TEXT', text });
    }
    await thWait(id);
    const pub = await postForm('Threads', `${TH}/me/threads_publish`, { creation_id: id, access_token: thToken() });
    let url = null;
    try { url = (await getJson('Threads', `${TH}/${pub.id}?fields=permalink&access_token=${encodeURIComponent(thToken())}`)).permalink; } catch {}
    return { message: 'Posted', url };
  },
};

/* =================== Facebook Page =================== */
const FB = 'https://graph.facebook.com/v23.0';
const fbCreds = () => {
  const { pageId, pageToken } = cfg().facebook;
  if (!pageId || !pageToken) throw new ApiError('Facebook', 'not set up yet — add your Page ID and Page token in Settings');
  return { pageId, pageToken };
};
export const facebook = {
  async whoami() {
    const { pageId, pageToken } = fbCreds();
    return (await getJson('Facebook', `${FB}/${pageId}?fields=name&access_token=${encodeURIComponent(pageToken)}`)).name;
  },
  async publish(post, text) {
    const { pageId, pageToken } = fbCreds();
    const videos = post.items.filter((i) => i.type === 'VIDEO');
    const images = post.items.filter((i) => i.type !== 'VIDEO');
    if (videos.length && !images.length) {
      const r = await postForm('Facebook', `${FB}/${pageId}/videos`, { file_url: videos[0].url, description: text, access_token: pageToken });
      return { message: 'Posted (video can take a few minutes to appear)', url: r.id ? `https://www.facebook.com/${r.id}` : null };
    }
    if (images.length === 1) {
      const r = await postForm('Facebook', `${FB}/${pageId}/photos`, { url: images[0].url, message: text, access_token: pageToken });
      return { message: videos.length ? 'Posted the photo (videos in a mixed album are skipped)' : 'Posted', url: r.post_id ? `https://www.facebook.com/${r.post_id}` : null };
    }
    if (images.length > 1) {
      const ids = [];
      for (const img of images.slice(0, 10)) ids.push((await postForm('Facebook', `${FB}/${pageId}/photos`, { url: img.url, published: 'false', access_token: pageToken })).id);
      const params = { message: text, access_token: pageToken };
      ids.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
      const r = await postForm('Facebook', `${FB}/${pageId}/feed`, params);
      return { message: videos.length ? 'Posted photos (videos in a mixed album are skipped)' : 'Posted', url: r.id ? `https://www.facebook.com/${r.id}` : null };
    }
    const r = await postForm('Facebook', `${FB}/${pageId}/feed`, { message: text, access_token: pageToken });
    return { message: 'Posted', url: r.id ? `https://www.facebook.com/${r.id}` : null };
  },
};

/* =================== Bluesky =================== */
async function bskySession() {
  const { handle, appPassword } = cfg().bluesky;
  if (!handle || !appPassword) throw new ApiError('Bluesky', 'not set up yet — add your handle and App Password in Settings');
  const s = await postJson('Bluesky', 'https://bsky.social/xrpc/com.atproto.server.createSession', { identifier: handle.replace(/^@/, ''), password: appPassword }, {}, 'direct');
  return s;
}
function bskyFacets(text) {
  const out = []; const enc = new TextEncoder();
  const b = (i) => enc.encode(text.slice(0, i)).length;
  for (const m of text.matchAll(/https?:\/\/[^\s)]+/g)) out.push({ index: { byteStart: b(m.index), byteEnd: b(m.index + m[0].length) }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }] });
  for (const m of text.matchAll(/(^|\s)(#[^\s#.,!?;:()]+)/gu)) {
    const start = m.index + m[1].length; const tag = m[2].slice(1);
    if (/^\d+$/.test(tag)) continue;
    out.push({ index: { byteStart: b(start), byteEnd: b(start + m[2].length) }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag }] });
  }
  return out;
}
export const bluesky = {
  limit: 300,
  async whoami() { return `@${(await bskySession()).handle}`; },
  async publish(post, text) {
    if ([...new Intl.Segmenter().segment(text)].length > 300) throw new ApiError('Bluesky', 'caption is over 300 characters — write a short version');
    const s = await bskySession();
    const auth = { Authorization: `Bearer ${s.accessJwt}` };
    const images = post.items.filter((i) => i.type !== 'VIDEO').slice(0, 4);
    let embed; let note = 'Posted';
    if (images.length) {
      const blobs = [];
      for (const img of images) {
        const blob = await fetchMedia(img.url);
        if (blob.size > 976_560) throw new ApiError('Bluesky', `an image is ${(blob.size / 1e6).toFixed(1)} MB; Bluesky's limit is about 1 MB`);
        const r = await call('Bluesky', 'https://bsky.social/xrpc/com.atproto.repo.uploadBlob', {
          method: 'POST', headers: { ...auth, 'Content-Type': blob.type.startsWith('image/') ? blob.type : 'image/jpeg' }, body: blob,
        }, 'direct');
        blobs.push({ alt: '', image: r.body.blob });
      }
      embed = { $type: 'app.bsky.embed.images', images: blobs };
      if (post.items.length > images.length) note = 'Posted images (videos are linked instead)';
    } else if (post.permalink) {
      embed = { $type: 'app.bsky.embed.external', external: { uri: post.permalink, title: 'Watch on Instagram', description: '' } };
      note = 'Posted with a link to the video on Instagram';
    }
    const record = { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString(), facets: bskyFacets(text), langs: ['en'] };
    if (embed) record.embed = embed;
    const r = await postJson('Bluesky', 'https://bsky.social/xrpc/com.atproto.repo.createRecord', { repo: s.did, collection: 'app.bsky.feed.post', record }, auth, 'direct');
    const rkey = r.uri?.split('/').pop();
    return { message: note, url: rkey ? `https://bsky.app/profile/${s.handle}/post/${rkey}` : null };
  },
};

/* =================== TikTok (through the relay) =================== */
const TT = 'https://open.tiktokapis.com';
export const tiktok = {
  redirectUri: () => SITE(),
  connect() {
    const { clientKey, directPost } = cfg().tiktok;
    if (!clientKey) throw new ApiError('TikTok', 'add your Client key and Client secret first, then Save');
    const state = 'tt_' + crypto.randomUUID().replace(/-/g, '');
    sessionStorage.setItem('tt_state', state);
    const u = new URL('https://www.tiktok.com/v2/auth/authorize/');
    u.searchParams.set('client_key', clientKey);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', ['user.info.basic', 'video.upload'].concat(directPost ? ['video.publish'] : []).join(','));
    u.searchParams.set('redirect_uri', SITE());
    u.searchParams.set('state', state);
    location.href = u.toString();
  },
  // Called on page load when TikTok sends you back with ?code=…
  async finishConnect(params) {
    if (!params.state?.startsWith('tt_')) return false;
    const expected = sessionStorage.getItem('tt_state');
    sessionStorage.removeItem('tt_state');
    if (params.error) throw new ApiError('TikTok', params.error_description || params.error);
    if (!expected || expected !== params.state) throw new ApiError('TikTok', 'sign-in expired — please click Connect TikTok again');
    const { clientKey, clientSecret } = cfg().tiktok;
    const t = await postForm('TikTok', `${TT}/v2/oauth/token/`, {
      client_key: clientKey, client_secret: clientSecret, code: params.code, grant_type: 'authorization_code', redirect_uri: SITE(),
    }, {}, 'relay');
    saveTT(t);
    return true;
  },
  async whoami() {
    const r = await getJson('TikTok', `${TT}/v2/user/info/?fields=display_name`, { Authorization: `Bearer ${await ttToken()}` }, 'relay');
    return r.data?.user?.display_name || 'Connected';
  },
  async publish(post, text, opts = {}) {
    const video = post.items.find((i) => i.type === 'VIDEO');
    if (!video) throw new ApiError('TikTok', 'only videos can be sent — TikTok photo posts need a verified website');
    const auth = { Authorization: `Bearer ${await ttToken()}` };
    const buf = await (await fetchMedia(video.url)).arrayBuffer();
    const size = buf.byteLength;
    const MB = 1024 * 1024;
    const chunk = size <= 64 * MB ? size : 10 * MB;
    const count = size <= 64 * MB ? 1 : Math.floor(size / chunk);
    const source_info = { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunk, total_chunk_count: count };
    const upload = async (uploadUrl) => {
      for (let i = 0; i < count; i++) {
        const start = i * chunk; const end = i === count - 1 ? size - 1 : start + chunk - 1;
        await call('TikTok', uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${start}-${end}/${size}` }, body: buf.slice(start, end + 1) }, 'relay');
      }
    };
    if (!cfg().tiktok.directPost) {
      const r = await postJson('TikTok', `${TT}/v2/post/publish/inbox/video/init/`, { source_info }, auth, 'relay');
      await upload(r.data.upload_url);
      return { message: 'Sent to your TikTok inbox — open TikTok, tap the notification, paste the caption and Post', copyCaption: true };
    }
    const info = await postJson('TikTok', `${TT}/v2/post/publish/creator_info/query/`, {}, auth, 'relay');
    const options = info.data?.privacy_level_options || ['SELF_ONLY'];
    const wanted = opts.tiktokPrivacy || 'PUBLIC_TO_EVERYONE';
    const privacy = options.includes(wanted) ? wanted : options.includes('SELF_ONLY') ? 'SELF_ONLY' : options[0];
    const r = await postJson('TikTok', `${TT}/v2/post/publish/video/init/`, {
      post_info: { title: [...text].slice(0, 2200).join(''), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false },
      source_info,
    }, auth, 'relay');
    await upload(r.data.upload_url);
    return { message: privacy === wanted ? 'Posted (TikTok may take a minute to process it)' : `Posted as ${privacy.replace(/_/g, ' ').toLowerCase()} — TikTok only allows that until your app passes its review` };
  },
};
function saveTT(t) {
  update('tiktok', {
    accessToken: t.access_token, refreshToken: t.refresh_token, openId: t.open_id,
    expiresAt: Date.now() + (t.expires_in - 60) * 1000,
  });
}
async function ttToken() {
  const tk = cfg().tiktok;
  if (!tk.accessToken) throw new ApiError('TikTok', 'not connected yet — click "Connect TikTok" in Settings');
  if (Date.now() < (tk.expiresAt || 0)) return tk.accessToken;
  const t = await postForm('TikTok', `${TT}/v2/oauth/token/`, { client_key: tk.clientKey, client_secret: tk.clientSecret, grant_type: 'refresh_token', refresh_token: tk.refreshToken }, {}, 'relay');
  saveTT(t);
  return t.access_token;
}

/* =================== YouTube (Google sign-in popup, no secret needed) =================== */
let gisLoading = null;
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = res; s.onerror = () => rej(new ApiError('YouTube', "couldn't load Google sign-in"));
    document.head.appendChild(s);
  });
  return gisLoading;
}
export const youtube = {
  origin: () => location.origin,
  preload: () => loadGis().catch(() => {}),
  hasToken: () => { const y = cfg().youtube; return !!y.accessToken && Date.now() < (y.expiresAt || 0); },
  // Must be called directly from a click (it opens Google's sign-in popup).
  signIn() {
    const { clientId } = cfg().youtube;
    if (!clientId) return Promise.reject(new ApiError('YouTube', 'add your Google Client ID in Settings first'));
    if (!window.google?.accounts?.oauth2) return Promise.reject(new ApiError('YouTube', 'Google sign-in is still loading — try again in a second'));
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
        callback: (r) => {
          if (r.error) return reject(new ApiError('YouTube', r.error_description || r.error));
          update('youtube', { accessToken: r.access_token, expiresAt: Date.now() + (Number(r.expires_in) - 60) * 1000, connected: true });
          resolve();
        },
        error_callback: (e) => reject(new ApiError('YouTube', e?.type === 'popup_closed' ? 'sign-in window was closed' : 'sign-in was blocked — allow pop-ups for this site')),
      });
      client.requestAccessToken({ prompt: cfg().youtube.connected ? '' : 'consent' });
    });
  },
  async whoami() {
    const y = cfg().youtube;
    if (!y.clientId) throw new ApiError('YouTube', 'not set up yet');
    if (!this.hasToken()) {
      if (y.connected) return 'Ready (signs in when you post)';
      throw new ApiError('YouTube', 'not connected yet — click "Connect YouTube" in Settings');
    }
    const r = await getJson('YouTube', 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { Authorization: `Bearer ${y.accessToken}` }, 'direct');
    return r.items?.[0]?.snippet?.title || 'Connected';
  },
  async publish(post, text, opts = {}) {
    const video = post.items.find((i) => i.type === 'VIDEO');
    if (!video) throw new ApiError('YouTube', 'YouTube only takes videos — this post has none');
    if (!this.hasToken()) throw new ApiError('YouTube', 'Google sign-in expired — click Post again and finish the Google pop-up');
    const blob = await fetchMedia(video.url);
    const first = (text.split('\n').find((l) => l.trim()) || 'New video').replace(/[<>]/g, '').trim();
    const autoTitle = /#shorts/i.test(first) ? [...first].slice(0, 100).join('') : `${[...first].slice(0, 90).join('')} #Shorts`;
    const meta = {
      snippet: { title: (opts.youtubeTitle || '').trim() || autoTitle, description: text.replace(/[<>]/g, '').slice(0, 5000), categoryId: '22' },
      status: { privacyStatus: opts.youtubePrivacy || 'public', selfDeclaredMadeForKids: false },
    };
    const boundary = 'cp' + Math.random().toString(36).slice(2);
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`, blob, `\r\n--${boundary}--`,
    ]);
    const r = await call('YouTube', 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
      method: 'POST', headers: { Authorization: `Bearer ${cfg().youtube.accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
    }, 'direct');
    const id = r.body.id; const st = r.body.status?.privacyStatus;
    return {
      message: st && st !== meta.status.privacyStatus ? `Uploaded as ${st} — YouTube keeps uploads private until your Google project passes its API audit` : 'Uploaded',
      url: id ? `https://youtube.com/shorts/${id}` : null,
    };
  },
};

/* =================== Relay check =================== */
export const relay = {
  async whoami() {
    const { url, key } = cfg().relay;
    if (!url) throw new ApiError('Relay', 'not set up yet');
    let r;
    try { r = await fetch(url.trim().replace(/\/+$/, '') + '/?ping=1', { headers: { 'X-Relay-Key': key || '' } }); }
    catch { throw new ApiError('Relay', "couldn't reach it — check the address"); }
    const b = await r.json().catch(() => ({}));
    if (r.status === 401) throw new ApiError('Relay', 'key does not match — check RELAY_KEY');
    if (!b.relay) throw new ApiError('Relay', "that address isn't a Crosspost relay");
    return 'Working';
  },
};

export const NETWORKS = { tiktok, threads, facebook, bluesky, youtube };
