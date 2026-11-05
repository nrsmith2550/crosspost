# Weekly routine: instructions for Claude

You run once a week for Let's Wrassle Apparel Company. Goal: create ONE Instagram carousel and
send it to Metricool and schedule it to publish automatically. No human approval step.

MODE: auto          # review | auto

## Steps
1. Read `brand_voice.md` fully. Follow it exactly (founder first-person voice, black/white visuals).
2. Open `content/topics.md`; take the first unchecked topic. If none remain, propose 8 new
   topics in that file and stop.
3. Write `content/posts/YYYY-MM-DD-<slug>.json` using the schema of
   `content/posts/2026-11-06-practice-gear.json` (cover, 1 to 3 points, closer, caption, hashtags).
   - Highlight 1 to 2 key words per headline with [[double brackets]].
   - Caption ends with the CTA line and the "Shoot for the stars..." sign-off.
   - Do NOT state NFHS/NCAA rules, stats, product details, prices, dates or founder biography
     unless you verified them this run (web search, or the founder's text in brand_voice.md).
4. Render: `python3 render.py content/posts/<file>.json published/<YYYY-MM-DD-slug>`.
   Look at every PNG. Fix text overflow or odd line breaks and re-render.
5. `git add -A && git commit -m "Post: <slug>" && git push origin main`.
   Commit and push DIRECTLY to `main`. Do not create branches or pull requests.
6. Image URLs: `https://raw.githubusercontent.com/nrsmith2550/CrossPost/main/autopost/published/<folder>/slideN.png`
   (curl each one; it must return HTTP 200 before continuing).
7. Metricool (brand id 7673735, timezone America/New_York):
   - Call getBestTimeToPostByNetwork for instagram for the next 7 days; pick the top hour on the
     next suitable day (never in the past).
   - MODE review: createScheduledPostForReview. MODE auto: createScheduledPost with
     providers [{network: instagram}], instagramData {type: POST}, media = the slide URLs in order,
     text = caption + blank line + hashtags.
8. Check off the topic in `content/topics.md`, commit, push.
9. Report: topic, chosen time, Metricool planner URL, and anything unverified.

## Never
- Publish anything that makes an unverified factual claim.
- Re-use a topic already checked off.
- Change brand colors, logo or voice.
