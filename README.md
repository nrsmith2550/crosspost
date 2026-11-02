# Crosspost

A free, phone-friendly page for sharing what you posted on Instagram to TikTok, X, Threads, Facebook, Bluesky, YouTube Shorts and other apps, a few taps each.

**Open it:** https://nrsmith2550.github.io/crosspost/ (tip: add it to your home screen)

## How it works

1. Optional: paste your Instagram post's link. The post appears using Instagram's official embed, caption included, so you can copy the caption without leaving the page. This only works for public accounts.
2. Choose the video or photos from your camera roll.
3. Paste your caption, plus an optional shorter version for X and Bluesky.
4. Tap a network. The caption is copied and your phone's share menu opens with your media attached. Pick the app, paste the caption, and post. A ✓ marks the networks you've done.

There are no developer apps, accounts or servers. Your files and caption never leave your phone except to go to the apps you choose. On a computer, where browsers can't hand files to other apps, each button copies the caption and opens that site's upload page instead.

### Optional: caption auto-fill

`worker/caption.js` is a small free Cloudflare Worker. Given a post link, it reads the caption from Instagram's public embed page, so Crosspost can fill in the caption box for you. Set it up from the page: tap **Set up auto-fill** under the link box. It only works for public posts, and Instagram may block it at times. When that happens, Crosspost tells you and you copy the caption by hand.

Everything else lives in `index.html`. The icons and `manifest.json` let you add it to your home screen.
