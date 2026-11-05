#!/usr/bin/env python3
"""Render an Instagram carousel (1080x1350 PNGs) from a post JSON file.

Usage: python3 $PWD/render.py $PWD/content/posts/<file>.json $PWD/published/<folder>
(use ABSOLUTE paths)

Text markup: [[double brackets]] = logo-style highlight block, **bold** = bold.

Post JSON fields
  style    "bold" (default) | "poster" | "light" | "checklist"
  cover    {kicker, headline, swipe, photo?}
  points   [{headline, body: [..], photo?}]            (bold / poster / light)
  list     {title, items: [..]}                         (checklist only, 3-6 items)
  closer   {body: [..], cta?, photo?}
  cta      optional pill on the last slide, e.g. "Save this for practice day"
  photo    optional per-slide background photo: local path or https URL.
           Only use photos Nate owns (his catalog/site images or his own photos).

See visual_research.md for why each style exists and how the weekly routine picks one.
"""
import json, re, shutil, subprocess, sys, html, platform
from pathlib import Path

ROOT = Path(__file__).parent
STYLES = ("bold", "poster", "light", "checklist")

CSS = """
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden}
body{font-family:'Avenir Next','Helvetica Neue',Arial,sans-serif;font-weight:800;background:#212427;color:#F4F4F4;position:relative}
.light{background:#F4F4F4;color:#191919}
.photo{background-color:#191919;background-size:cover;background-position:center;color:#F4F4F4}
.photo::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(25,25,25,.55) 0%,rgba(25,25,25,.82) 100%)}
.wrap{position:absolute;inset:0;padding:110px 90px;display:flex;flex-direction:column;justify-content:center}
.top{position:absolute;top:50px;left:90px;right:90px;display:flex;justify-content:space-between;align-items:center;font:600 28px 'Helvetica Neue',Arial,sans-serif;letter-spacing:4px;opacity:.9;z-index:2}
.bot{position:absolute;bottom:60px;left:90px;right:90px;display:flex;justify-content:space-between;align-items:center;font:600 28px 'Helvetica Neue',Arial,sans-serif;letter-spacing:3px;opacity:.8;z-index:2}
.wrap{z-index:1}
.logoplate{background:#fff;border-radius:18px;padding:6px 14px;display:inline-flex}.logoplate img{height:64px;display:block}
.logoimg{height:72px}.light .logoimg,.light .biglogo{mix-blend-mode:multiply}
.biglogo{width:760px;margin-left:-40px;display:block}
.big{font-size:138px;line-height:1;text-transform:uppercase;letter-spacing:-1px;font-weight:900}
.mid{font-size:84px;line-height:1.05;text-transform:uppercase;letter-spacing:-1px;font-weight:900}
.kicker{font-size:56px;margin-bottom:24px;font-weight:700;opacity:.85}
.body{font:500 40px/1.35 'Helvetica Neue',Arial,sans-serif;margin-top:30px;max-width:860px}
.body.first{margin-top:44px}
.hl{display:inline-block;background:#fff;color:#191919;padding:0 16px}.light .hl{background:#191919;color:#fff}
.num{font-size:200px;line-height:1;opacity:.12;position:absolute;right:70px;top:140px;font-weight:900;z-index:1}
.bar{height:10px;width:140px;background:#fff;margin:36px 0}.light .bar{background:#191919}
.cta{display:inline-block;margin-top:44px;font:800 38px 'Avenir Next','Helvetica Neue',sans-serif;letter-spacing:1px;text-transform:uppercase;border:6px solid currentColor;padding:14px 30px;align-self:flex-start}
/* poster: one giant statement per slide */
.st-poster .big{font-size:176px;line-height:.96}
.st-poster .mid{font-size:150px;line-height:.98}
.st-poster .body{font-size:36px;max-width:760px}
.st-poster .bar{display:none}
.st-poster .num{display:none}
/* checklist */
.items{margin-top:50px;display:flex;flex-direction:column;gap:30px}
.item{display:flex;gap:28px;align-items:flex-start;font:700 44px/1.2 'Avenir Next','Helvetica Neue',sans-serif}
.box{flex:0 0 58px;height:58px;border:6px solid currentColor;display:flex;align-items:center;justify-content:center;font-size:40px;line-height:1}
"""


def hl(text):
    t = html.escape(text)
    t = re.sub(r"\[\[(.+?)\]\]", r"<span class='hl'>\1</span>", t)
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)


def plain(text):
    return re.sub(r"\[\[|\]\]|\*\*", "", text)


def bodies(items):
    return "".join(f"<div class='body{' first' if i == 0 else ''}'>{hl(b)}</div>" for i, b in enumerate(items))


def cta_html(cta):
    return f"<div class='cta'>{html.escape(cta)}</div>" if cta else ""


def page(cls, inner, n, total, show_logo=True, photo=None, style=""):
    light = "light" in cls.split()
    if not show_logo:
        logo = "<span></span>"
    elif light:
        logo = "<img class='logoimg' src='logo.png'>"
    else:
        logo = "<span class='logoplate'><img src='logo.png'></span>"
    body_cls = f"{cls} st-{style}".strip()
    inline = ""
    if photo:
        body_cls += " photo"
        inline = f" style=\"background-image:url('{html.escape(str(photo))}')\""
    return (f"<!DOCTYPE html><html><head><meta charset='utf-8'><style>{CSS}</style></head>"
            f"<body class='{body_cls}'{inline}><div class='top'>{logo}<span>{n}/{total}</span></div>"
            f"<div class='wrap'>{inner}</div>"
            f"<div class='bot'><span>letswrassleapparel.com</span><span>🤼</span></div></body></html>")


def build_slides(post):
    style = post.get("style", "bold")
    if style not in STYLES:
        sys.exit(f"Unknown style {style!r}; use one of {STYLES}")
    cover, closer = post["cover"], post["closer"]
    cta = post.get("cta") or closer.get("cta")
    s = []  # (cls, inner, show_logo, photo, words)

    def alt(i):  # palette per slide index (0-based, cover=0)
        if style == "light":
            return "light"
        if style == "poster":
            return ""
        return "light" if i % 2 else ""

    # Cover: ONE headline, uncluttered (research: hook decides the swipe)
    s.append(("", f"<div class='kicker'>{hl(cover['kicker'])}</div><div class='big'>{hl(cover['headline'])}</div>"
                  f"<div class='body first'>{hl(cover.get('swipe', 'Swipe →'))}</div>", True, cover.get("photo"),
              [cover["kicker"], cover["headline"], cover.get("swipe", "")]))
    if style == "light":
        s[0] = ("light",) + s[0][1:]

    if style == "checklist":
        lst = post["list"]
        items = "".join(f"<div class='item'><div class='box'>✓</div><div>{hl(i)}</div></div>" for i in lst["items"])
        s.append(("light", f"<div class='mid'>{hl(lst['title'])}</div><div class='bar'></div><div class='items'>{items}</div>",
                  True, lst.get("photo"), [lst["title"]] + lst["items"]))
    else:
        for i, p in enumerate(post["points"], 1):
            s.append((alt(i), f"<div class='num'>{i:02d}</div><div class='mid'>{hl(p['headline'])}</div>"
                              f"<div class='bar'></div>{bodies(p['body'])}", True, p.get("photo"),
                      [p["headline"]] + p["body"]))
    # Closer: brand logo, mission, ONE call to action
    idx = len(s)
    s.append((alt(idx), f"<img class='biglogo' src='logo.png'><div class='bar'></div>{bodies(closer['body'])}{cta_html(cta)}",
              False, closer.get("photo"), closer["body"] + ([cta] if cta else [])))
    total = len(s)
    out = []
    for n, (cls, inner, logo, photo, texts) in enumerate(s, 1):
        words = sum(len(plain(t).split()) for t in texts)
        if words > 45:
            print(f"warning: slide {n} has {words} words (aim for 40 or fewer)", file=sys.stderr)
        out.append((cls, inner, logo, photo, n, total, style))
    return out


def chrome_bin():
    for c in ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
              "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        if Path(c).exists() or shutil.which(c):
            return c
    sys.exit("Chrome/Chromium not found")


def main():
    post_path = Path(sys.argv[1]).resolve()
    out = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else ROOT / "out" / post_path.stem
    out.mkdir(parents=True, exist_ok=True)
    shutil.copy(ROOT / "assets" / "logo.png", out / "logo.png")
    post = json.loads(post_path.read_text())
    chrome = chrome_bin()
    flags = ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1080,1350",
             "--virtual-time-budget=8000"]
    if platform.system() == "Linux":
        flags += ["--no-sandbox"]
    for cls, inner, logo, photo, n, total, style in build_slides(post):
        if photo and not str(photo).startswith(("http://", "https://")):
            src = (post_path.parent / photo) if not Path(photo).is_absolute() else Path(photo)
            if not src.exists():
                src = ROOT / photo
            dest = out / f"photo{n}{src.suffix}"
            shutil.copy(src, dest)
            photo = dest.name
        f = out / f"slide{n}.html"
        f.write_text(page(cls, inner, n, total, logo, photo, style))
        subprocess.run([chrome, *flags, f"--screenshot={out / f'slide{n}.png'}", f"file://{f}"],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        f.unlink()
        if photo and not str(photo).startswith(("http://", "https://")):
            (out / photo).unlink()
    (out / "logo.png").unlink()
    print(out)


if __name__ == "__main__":
    main()
