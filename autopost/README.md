# Let's Wrassle autopost

Weekly Instagram carousel generator + Metricool scheduler.

- `render.py` turns a post JSON into 1080x1350 PNG slides (needs Chrome/Chromium, Python 3).
- `content/topics.md` is the topic queue; `content/posts/` holds post JSON.
- `published/` holds rendered slides that get public raw.githubusercontent.com URLs for Metricool.
- `ROUTINE.md` is the prompt the weekly Claude routine follows.
- `brand_voice.md` is the brand voice and visual guide.

Test locally: `python3 render.py content/posts/2026-11-06-practice-gear.json`

## Location
Lives in the `autopost/` folder of the CrossPost repo. Public image URLs look like
`https://raw.githubusercontent.com/nrsmith2550/CrossPost/main/autopost/published/<folder>/slideN.png`.
