#!/usr/bin/env python3
"""Render an Instagram carousel (1080x1350 PNGs) from a post JSON file.

Usage: python3 render.py content/posts/2026-11-06-practice-gear.json [out_dir]
Highlights: wrap words in [[double brackets]] to get the logo-style block.
"""
import json, re, shutil, subprocess, sys, html, platform
from pathlib import Path

ROOT = Path(__file__).parent
CSS = """
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden}
body{font-family:'Avenir Next','Helvetica Neue',Arial,sans-serif;font-weight:800;background:#212427;color:#F4F4F4;position:relative}
.light{background:#F4F4F4;color:#191919}
.wrap{position:absolute;inset:0;padding:110px 90px;display:flex;flex-direction:column;justify-content:center}
.top{position:absolute;top:50px;left:90px;right:90px;display:flex;justify-content:space-between;align-items:center;font:600 28px 'Helvetica Neue',Arial,sans-serif;letter-spacing:4px;opacity:.9}
.bot{position:absolute;bottom:60px;left:90px;right:90px;display:flex;justify-content:space-between;align-items:center;font:600 28px 'Helvetica Neue',Arial,sans-serif;letter-spacing:3px;opacity:.8}
.logoplate{background:#fff;border-radius:18px;padding:6px 14px;display:inline-flex}.logoplate img{height:64px;display:block}
.logoimg{height:72px}.light .logoimg,.light .biglogo{mix-blend-mode:multiply}
.biglogo{width:760px;margin-left:-40px;display:block}
.big{font-size:138px;line-height:1;text-transform:uppercase;letter-spacing:-1px;font-weight:900}
.mid{font-size:84px;line-height:1.05;text-transform:uppercase;letter-spacing:-1px;font-weight:900}
.kicker{font-size:56px;margin-bottom:24px;font-weight:700;opacity:.85}
.body{font:500 40px/1.35 'Helvetica Neue',Arial,sans-serif;margin-top:30px;max-width:860px}
.body.first{margin-top:44px}
.hl{display:inline-block;background:#fff;color:#191919;padding:0 16px}.light .hl{background:#191919;color:#fff}
.num{font-size:200px;line-height:1;opacity:.12;position:absolute;right:70px;top:140px;font-weight:900}
.bar{height:10px;width:140px;background:#fff;margin:36px 0}.light .bar{background:#191919}
"""

def hl(text):
    t = html.escape(text)
    t = re.sub(r"\[\[(.+?)\]\]", r"<span class='hl'>\1</span>", t)
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)

def bodies(items):
    return "".join(f"<div class='body{' first' if i == 0 else ''}'>{hl(b)}</div>" for i, b in enumerate(items))

def page(cls, inner, n, total, show_logo=True):
    if not show_logo:
        logo = "<span></span>"
    elif "light" in cls:
        logo = "<img class='logoimg' src='logo.png'>"
    else:
        logo = "<span class='logoplate'><img src='logo.png'></span>"
    return (f"<!DOCTYPE html><html><head><meta charset='utf-8'><style>{CSS}</style></head>"
            f"<body class='{cls}'><div class='top'>{logo}<span>{n}/{total}</span></div>"
            f"<div class='wrap'>{inner}</div>"
            f"<div class='bot'><span>letswrassleapparel.com</span><span>🤼</span></div></body></html>")

def build_slides(post):
    pts = post["points"]
    total = len(pts) + 2
    s = []
    cover = post["cover"]
    s.append(("", f"<div class='kicker'>{hl(cover['kicker'])}</div><div class='big'>{hl(cover['headline'])}</div>"
                  f"<div class='body first'>{hl(cover.get('swipe', 'Swipe →'))}</div>", True))
    for i, p in enumerate(pts, 1):
        cls = "light" if i % 2 else ""
        s.append((cls, f"<div class='num'>{i:02d}</div><div class='mid'>{hl(p['headline'])}</div><div class='bar'></div>{bodies(p['body'])}", True))
    closer = post["closer"]
    cls = "light" if len(pts) % 2 == 0 else ""
    s.append((cls, f"<img class='biglogo' src='logo.png'><div class='bar'></div>{bodies(closer['body'])}", False))
    return [(c, h, logo, i + 1, total) for i, (c, h, logo) in enumerate(s)]

def chrome_bin():
    for c in ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
              "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        if Path(c).exists() or shutil.which(c):
            return c
    sys.exit("Chrome/Chromium not found")

def main():
    post_path = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "out" / post_path.stem
    out.mkdir(parents=True, exist_ok=True)
    shutil.copy(ROOT / "assets" / "logo.png", out / "logo.png")
    post = json.loads(post_path.read_text())
    chrome = chrome_bin()
    flags = ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1080,1350"]
    if platform.system() == "Linux":
        flags += ["--no-sandbox"]
    for cls, inner, logo, n, total in build_slides(post):
        f = out / f"slide{n}.html"
        f.write_text(page(cls, inner, n, total, logo))
        subprocess.run([chrome, *flags, f"--screenshot={out / f'slide{n}.png'}", f"file://{f}"],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        f.unlink()
    (out / "logo.png").unlink()
    print(out)

if __name__ == "__main__":
    main()
