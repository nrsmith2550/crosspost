// Network helpers. Some platforms can be called straight from the browser; others
// (TikTok, Instagram's media files) must go through your free relay (see worker/relay.js).
import { cfg } from './store.js';

export class ApiError extends Error {
  constructor(platform, message, details) {
    super(message);
    this.platform = platform;
    this.details = details;
  }
}

export const hasRelay = () => !!cfg().relay.url;

function relayed(url) {
  const base = cfg().relay.url.trim().replace(/\/+$/, '');
  return `${base}/?url=${encodeURIComponent(url)}`;
}

function pickMessage(body) {
  if (!body) return null;
  if (typeof body === 'string') return body.slice(0, 300);
  return body.error?.error_user_msg || body.error?.message || (typeof body.error === 'string' ? body.error : null) ||
    body.error_description || body.message || body.detail || null;
}

/**
 * via: 'direct'  — always call the platform from the browser
 *      'relay'   — always go through the relay (required)
 *      'auto'    — use the relay when one is set up, otherwise direct
 */
export async function call(platform, url, opts = {}, via = 'auto') {
  const useRelay = via === 'relay' || (via === 'auto' && hasRelay());
  if (useRelay && !hasRelay()) throw new ApiError(platform, 'needs the free relay — set it up in Settings first');
  const headers = { ...(opts.headers || {}) };
  if (useRelay) headers['X-Relay-Key'] = cfg().relay.key || '';
  let res;
  try {
    res = await fetch(useRelay ? relayed(url) : url, { ...opts, headers });
  } catch (e) {
    throw new ApiError(platform, useRelay
      ? "couldn't reach your relay — check the relay address in Settings"
      : 'your browser blocked this request — setting up the free relay in Settings fixes this');
  }
  const text = await res.text();
  let body = text;
  try { body = JSON.parse(text); } catch {}
  if (useRelay && res.status === 401 && body?.relay) throw new ApiError(platform, 'the relay rejected the key — check the relay key in Settings');
  const tiktokErr = body && typeof body === 'object' && body.error && typeof body.error.code === 'string' && body.error.code !== 'ok';
  if (!res.ok || tiktokErr) {
    const code = tiktokErr ? ` [${body.error.code}]` : '';
    throw new ApiError(platform, (pickMessage(body) || `HTTP ${res.status}`) + code, body);
  }
  return { body, headers: res.headers, status: res.status };
}

export const getJson = async (platform, url, headers = {}, via) => (await call(platform, url, { headers }, via)).body;

export const postForm = async (platform, url, params, headers = {}, via) => (await call(platform, url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
  body: new URLSearchParams(params).toString(),
}, via)).body;

export const postJson = async (platform, url, data, headers = {}, via) => (await call(platform, url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=UTF-8', ...headers },
  body: JSON.stringify(data),
}, via)).body;

// Download an Instagram photo/video into the browser. Tries directly first (safe: it's only a read),
// then falls back to the relay.
export async function fetchMedia(url) {
  try {
    const r = await fetch(url);
    if (r.ok) return await r.blob();
  } catch {}
  if (!hasRelay()) throw new ApiError('Media', "your browser can't download Instagram media by itself — set up the free relay in Settings");
  let r;
  try {
    r = await fetch(relayed(url), { headers: { 'X-Relay-Key': cfg().relay.key || '' } });
  } catch {
    throw new ApiError('Media', "couldn't reach your relay — check the relay address in Settings");
  }
  if (r.status === 401) throw new ApiError('Media', 'the relay rejected the key — check the relay key in Settings');
  if (!r.ok) throw new ApiError('Media', `couldn't download the media file (HTTP ${r.status})`);
  return await r.blob();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
