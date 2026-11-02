// Crosspost caption helper — a free Cloudflare Worker.
// Given an Instagram post link, it loads the post's public embed page and returns the caption.
// Instagram can block or change this at any time; Crosspost falls back to manual copy if it fails.
//
// Usage:  GET https://<your-worker>.workers.dev/?url=https://www.instagram.com/p/ABC123/
// Answer: { "caption": "...", "username": "..." }   or   { "error": "..." }
//
// Optional setting (Worker → Settings → Variables and Secrets):
//   ALLOWED_ORIGIN  (Text) e.g. https://nrsmith2550.github.io — only that site may use the helper.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export default {
  async fetch(request, env) {
    const allowed = env.ALLOWED_ORIGIN || '*';
    const origin = request.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' };
    const json = (status, obj) => new Response(JSON.stringify(obj), {
      status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store' },
    });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) return json(403, { error: 'This site is not allowed to use the helper' });

    const params = new URL(request.url).searchParams;
    if (params.has('ping')) return json(200, { ok: true, helper: 'crosspost-caption' });

    const code = shortcode(params.get('url') || '');
    if (!code) return json(400, { error: 'That is not an Instagram post link' });

    const attempts = [
      () => fromPage(`https://www.instagram.com/p/${code}/embed/captioned/`),
      () => fromPage(`https://www.instagram.com/p/${code}/`),
    ];
    let lastError = 'Instagram did not return the post';
    for (const attempt of attempts) {
      try {
        const r = await attempt();
        if (r && r.caption != null) return json(200, r);
      } catch (e) {
        lastError = e.message;
      }
    }
    return json(502, { error: lastError });
  },
};

function shortcode(link) {
  const m = String(link).trim().match(/instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

async function fromPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow',
  });
  if (res.status === 404) throw new Error('Post not found — is the account public?');
  if (!res.ok) throw new Error(`Instagram answered ${res.status}`);
  const html = await res.text();
  if (/accounts\/login/.test(res.url)) throw new Error('Instagram asked for a login instead of showing the post');
  return extract(html);
}

// Tries several places Instagram has kept the caption, newest first.
function extract(html) {
  // 1. Caption JSON embedded in the page (sometimes escaped inside another JSON string)
  for (const src of [html, unescapeOnce(html)]) {
    const m = src.match(/"edge_media_to_caption"\s*:\s*\{\s*"edges"\s*:\s*\[\s*\{\s*"node"\s*:\s*\{\s*"text"\s*:\s*("(?:[^"\\]|\\.)*")/);
    if (m) {
      const user = src.match(/"owner"\s*:\s*\{[^}]*?"username"\s*:\s*"([^"]+)"/);
      return { caption: JSON.parse(m[1]), username: user ? user[1] : null, source: 'json' };
    }
    if (/"edge_media_to_caption"\s*:\s*\{\s*"edges"\s*:\s*\[\s*\]/.test(src)) return { caption: '', username: null, source: 'json' };
  }

  // 2. The caption block of the embed page
  const block = html.match(/<div class="Caption"[^>]*>([\s\S]*?)<div class="CaptionComments"/i);
  if (block) {
    let inner = block[1];
    const user = inner.match(/class="CaptionUsername"[^>]*>([^<]+)</);
    inner = inner.replace(/<a[^>]*class="CaptionUsername"[^>]*>[\s\S]*?<\/a>/i, '');
    return { caption: htmlToText(inner), username: user ? decode(user[1]).trim() : null, source: 'embed' };
  }

  // 3. The page's description tag:  12 likes, 3 comments - user on May 1, 2026: "caption".
  const meta = html.match(/<meta[^>]+(?:property|name)="(?:og:description|description)"[^>]+content="([^"]*)"/i)
    || html.match(/<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="(?:og:description|description)"/i);
  if (meta) {
    const d = decode(meta[1]);
    const m = d.match(/^.*?\s-\s([A-Za-z0-9_.]+)\s+on\s+[^:]+:\s*["“]([\s\S]*)["”]\.?\s*$/);
    if (m) return { caption: m[2], username: m[1], source: 'meta' };
  }
  return null;
}

function unescapeOnce(s) {
  return s.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function htmlToText(h) {
  return decode(h
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
