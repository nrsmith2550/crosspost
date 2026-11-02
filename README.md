# Crosspost

See all your Instagram posts, click one, pick where it goes (TikTok, X, Threads, Facebook, Bluesky, YouTube), and post it. Free, with no third-party posting service.

**Open it:** https://nrsmith2550.github.io/crosspost/

## How it works

- The site is a plain web page hosted free on GitHub Pages.
- Your keys and tokens are saved **only in your browser** (localStorage), never in this repo. To use another device, go to Settings → *Use on another device* and copy the backup code.
- Threads, Facebook, Bluesky, YouTube and your Instagram feed are called directly from the page.
- Browsers aren't allowed to talk to TikTok or download Instagram's video files directly, so those requests go through a **free relay** you run on Cloudflare Workers ([`worker/relay.js`](worker/relay.js)). The relay only talks to the platforms on its allowlist and only accepts requests that carry your relay key.

## One-time setup

1. **Turn on GitHub Pages:** go to the repo's **Settings → Pages**, set *Source* to **Deploy from a branch**, choose `main` and `/ (root)`, then Save. After about a minute the site is live at the address above.
2. **Open the site → Settings.** Connect Instagram first, then the free relay, then whichever networks you want. Each one has step-by-step instructions on the page.

| Network | Notes |
|---|---|
| Instagram | Must be a Professional (Creator or Business) account, which is free. The token renews automatically. |
| TikTok | Videos only. They go to your TikTok inbox as drafts; tap the notification and Post. Needs the relay. |
| X | No setup. Opens X's free compose window with your caption; you attach the media. (X charges for API posting.) |
| Threads | 500 characters max. |
| Facebook | Posts to a Page you manage, not a personal profile. |
| Bluesky | 300 characters, up to 4 photos, about 1 MB each. Video posts are shared as a link. |
| YouTube | Videos are uploaded as Shorts, about 6 a day on the free quota. Google confirms with a quick pop-up about once an hour. |

## Files

- `index.html`, `style.css`, `js/`: the website
- `worker/relay.js`: paste this into a Cloudflare Worker (see Settings → Free relay)
