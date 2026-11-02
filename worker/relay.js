// Crosspost relay — a free Cloudflare Worker.
// Browsers aren't allowed to talk to TikTok or download Instagram's media files directly,
// so the Crosspost page sends those requests here and this Worker passes them along.
//
// Settings (Cloudflare dashboard → your Worker → Settings → Variables and Secrets):
//   RELAY_KEY       (Secret) any long random password — paste the same value into Crosspost's Settings
//   ALLOWED_ORIGIN  (Text, optional) e.g. https://nrsmith2550.github.io — only that site may use the relay

const ALLOWED_HOSTS = [
  /^graph\.instagram\.com$/,
  /^graph\.facebook\.com$/,
  /^graph\.threads\.net$/,
  /^open\.tiktokapis\.com$/,
  /^open-upload\.tiktokapis\.com$/,
  /(^|\.)cdninstagram\.com$/,
  /(^|\.)fbcdn\.net$/,
  /^bsky\.social$/,
];
const FORWARD_HEADERS = ['authorization', 'content-type', 'content-range'];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Content-Range, X-Relay-Key',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) return json(403, { relay: true, error: 'origin not allowed' });
    if (!env.RELAY_KEY) return json(500, { relay: true, error: 'RELAY_KEY is not set on the Worker' });
    if (request.headers.get('X-Relay-Key') !== env.RELAY_KEY) return json(401, { relay: true, error: 'bad relay key' });

    const params = new URL(request.url).searchParams;
    if (params.get('ping')) return json(200, { relay: true, ok: true });

    let target;
    try { target = new URL(params.get('url') || ''); } catch { return json(400, { relay: true, error: 'missing or bad url' }); }
    if (target.protocol !== 'https:' || !ALLOWED_HOSTS.some((re) => re.test(target.hostname))) {
      return json(403, { relay: true, error: `host not allowed: ${target.hostname}` });
    }

    const headers = new Headers();
    for (const h of FORWARD_HEADERS) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }
    const hasBody = !['GET', 'HEAD'].includes(request.method);
    // Buffer the body so the upstream gets a proper Content-Length (TikTok requires it).
    const body = hasBody ? await request.arrayBuffer() : undefined;

    let upstream;
    try {
      upstream = await fetch(target.toString(), { method: request.method, headers, body, redirect: 'follow' });
    } catch (e) {
      return json(502, { relay: true, error: `upstream unreachable: ${e.message}` });
    }
    const out = new Headers(cors);
    out.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
