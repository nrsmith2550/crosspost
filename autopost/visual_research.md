# Visual strategy research: what to use for Let's Wrassle Instagram posts

Researched 2026-11-05. Treat numbers as directional: most sources are marketing blogs and they
disagree. The best evidence is Socialinsider's 2026 Instagram benchmarks. Nothing here is
wrestling-brand-specific data, because none was found. Our own Metricool results should
override this file over time (see "Learning loop").

## What the research says
1. **Carousels beat static posts.** Socialinsider's 2026 benchmarks put carousels at about
   0.50-0.55% engagement rate, Reels at about 0.48-0.52%, and static images at about 0.37%
   (static is declining about 17% year over year). Carousels lead on saves; Reels lead on reach.
   One DTC-fashion source (Draper) says Reels win for fashion (about 2% vs 0.9% for carousels);
   its method is unverified. So: carousels as the weekly staple, and Nate's own Reels/video
   (TikTok scripts already made each week) are the reach play.
   - https://www.socialinsider.io/instagram-benchmarks
   - https://www.socialinsider.io/blog/instagram-carousel-posts-study/
   - https://draper.chat/blog/instagram-engagement-rate-dtc-fashion-2026
2. **Saves and shares are the strongest signals**, so make posts worth saving or sending
   (checklists, "send this to your training partner").
3. **Slide 1 decides the swipe.** One clear headline, lots of empty space, no logo-only or soft
   title card. Slide 2 must also make sense on its own (some people land there first).
4. **Keep it light:** about 30-40 words per slide, one idea per slide, consistent fonts, colors
   and margins, and exactly ONE call to action at the end (save, share or tag).
5. **Community and real people beat polished ads for apparel.** Gymshark's growth is credited to
   UGC, creators and community challenges (marketing-blog sources, unverified numbers); Aime
   Leon Dore leans on personal, real-life imagery mixed with product shots. Real wrestlers
   wearing Let's Wrassle gear is the strongest content, and the current posts have none.
6. **Product has to appear.** Nothing here sells shirts unless shirts show up. Roughly every
   4th post should be a product or catalog spotlight (real product photos from
   letswrassleapparel.com or Nate's own photos, verified names only).

## Visual styles available (set "style" in the post JSON; see render.py)
| style | look | best for | CTA |
|---|---|---|---|
| bold | alternating charcoal/off-white slides, highlight blocks | story and message posts (default) | follow / site |
| poster | all charcoal, one giant statement per slide | motivation, tournament-day mindset, high swipe-through | share / tag |
| light | all off-white with black blocks | clean, calm, gear and product copy | save |
| checklist | cover + a checkbox list slide + closer | useful, save-worthy: gear bags, tournament-day lists | "Save this" |
Any slide can take a `photo` (URL or local file) as a darkened full-bleed background. Use only
photos Nate owns: his site's product images or his own pictures.

## Weekly rotation (the routine follows this)
- Look at the `style` of the last 3 posts in content/posts/ and pick a style NOT used in the last 2.
- Message/story topic: bold or poster. List/tips topic: checklist. Product topic: light or bold
  with a `photo` taken from letswrassleapparel.com (check name and price on the site this run).
- First slide: one headline, 8 words or fewer. Slide 2 stands alone. 40 words per slide or fewer.
- End with ONE CTA in the `cta` field: "Save this" (checklists), "Tag a teammate" (message),
  "Send this to your training partner" (parents/mindset), or the shop link every 4th week.
- Never leave the brand: black/white palette, website logo, founder voice.

## Learning loop (own data beats this file)
Each run, before choosing a style, pull the last 6 weeks of Instagram post performance from
Metricool (getAnalyticsDataByMetrics; saves, shares, reach, engagement) and append one line per
post to `content/style_performance.md`: date, slug, style, saves, shares, reach, engagement.
If one style has clearly better saves/shares after 3+ posts, use it more often, but never the
same style 3 weeks in a row. Re-run this research (WebSearch) about once a quarter and update the
findings above with sources.

## Gaps
No sourced data was found for Cliff Keen, RUDIS, Phenom Elite or Brute Instagram content, or for
Represent. Worth a manual look at those accounts to see what their most-liked posts have in
common, then record it here.
