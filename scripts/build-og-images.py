"""Share-preview images (1200x630 JPEG) for the homepage, guides, /trains/ hub and 25 city pages.
Needs Playwright + Chrome and Plus Jakarta Sans woff2 files:
  FONT_DIR=/path/to/@fontsource/plus-jakarta-sans/files python3 scripts/build-og-images.py"""
import base64, glob, html, json, math, os, re
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.environ['FONT_DIR']
cities = json.load(open(f'{ROOT}/data/rail-cities/cities.json'))
summary = json.load(open(f'{ROOT}/data/rail-cities/summary.json'))
maps = json.load(open(f'{ROOT}/data/rail-cities/maps.json'))
COL = ['#7d8aa5', '#4f7cff', '#ff7a2f', '#2bb39a']

def font_face():
    out = []
    for w in (500, 700, 800):
        b = base64.b64encode(open(f'{FONT_DIR}/plus-jakarta-sans-latin-{w}-normal.woff2', 'rb').read()).decode()
        out.append(f"@font-face{{font-family:PJS;font-weight:{w};src:url(data:font/woff2;base64,{b}) format('woff2')}}")
    return ''.join(out)
FONTS = font_face()

def dots_svg(slug, w=430, h=470, home=False, r=4.2):
    m = maps[slug]; la0, la1, lo0, lo1 = m['b']
    k = math.cos(math.radians((la0 + la1) / 2))
    bw, bh = (lo1 - lo0) * k, la1 - la0
    s = min((w - 30) / bw, (h - 30) / bh); ox = (w - bw * s) / 2; oy = (h - bh * s) / 2
    raw = base64.b64decode(m['p']); pts = []
    for i in range(0, len(raw) - 2, 3):
        x, y, c = raw[i], raw[i + 1], raw[i + 2]
        pts.append((ox + x / 255 * bw * s, oy + y / 255 * bh * s, c))
    circles = ''.join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r if c else r*0.76:.1f}" fill="{COL[c]}" stroke="#0f1b33" stroke-width="{r*0.28:.1f}"/>' for c in (0, 1, 2, 3) for x, y, cc in pts if cc == c)
    pin = ''
    if home:
        dx = ox + (m['dt'][1] - lo0) * k * s; dy = oy + (la1 - m['dt'][0]) * s
        pin = f'<g transform="translate({dx:.0f},{dy:.0f})"><circle r="34" fill="none" stroke="#ff7a2f" stroke-dasharray="4 5" stroke-width="2" opacity=".8"/><rect x="-17" y="-17" width="34" height="34" rx="9" fill="#fff"/><text y="7" text-anchor="middle" font-size="19" font-weight="800" fill="#0f1b33">H</text></g>'
    return f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}">{circles}{pin}</svg>'

MARK = '<svg viewBox="0 0 40 40" width="26" height="26" fill="none"><path d="M5 18 20 6l15 12M10 16v18h20V16M16 34V23h8v11" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
CSS = """*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#0f1b33;font-family:PJS,sans-serif;color:#fff;position:relative;overflow:hidden}
.glow{position:absolute;inset:0;background:radial-gradient(700px 500px at 85% 40%,rgba(36,81,230,.35),transparent 70%),radial-gradient(500px 400px at 0% 100%,rgba(36,81,230,.22),transparent 70%)}
.left{position:absolute;left:68px;top:58px;bottom:54px;width:640px;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:14px;font-size:24px;font-weight:800;letter-spacing:-.01em}
.mark{width:46px;height:46px;border-radius:13px;background:#2451e6;display:flex;align-items:center;justify-content:center}
.eye{margin-top:auto;font-size:17px;font-weight:800;letter-spacing:.14em;color:#9fb6ff}
h1{font-size:58px;line-height:1.06;letter-spacing:-.03em;font-weight:800;margin:14px 0 0}
h1.s{font-size:48px}h1.xs{font-size:42px}
.sub{font-size:23px;line-height:1.4;color:#c9d4ee;margin-top:18px;font-weight:500}
.stats{display:flex;gap:14px;margin-top:26px}.st{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:14px 18px}
.st b{display:block;font-size:34px;font-weight:800;letter-spacing:-.02em}.st span{font-size:15px;color:#c9d4ee;font-weight:600}
.st.n b{color:#ff9a5c}.st.q b{color:#4fd1b5}
.foot{margin-top:auto;padding-top:22px;font-size:17px;color:#9fb0d3;font-weight:600}
.right{position:absolute;right:56px;top:70px;width:430px;height:490px;border-radius:26px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1)}
.right svg{position:absolute;left:0;top:10px}
.key{position:absolute;left:22px;bottom:16px;display:flex;gap:14px;font-size:14px;color:#c9d4ee;font-weight:600}
.key i{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:6px;vertical-align:-1px}"""

def page(eyebrow, title, sub, right_slug, stats='', home_pin=False, foot='FRA crossing records · FHWA road counts · FEMA flood maps'):
    cls = '' if len(title) <= 34 else 's' if len(title) <= 56 else 'xs'
    key = '<div class="key"><span><i style="background:#ff7a2f"></i>Night trains</span><span><i style="background:#2bb39a"></i>Quiet zone</span><span><i style="background:#4f7cff"></i>Day only</span></div>'
    return f"""<html><head><style>{FONTS}{CSS}</style></head><body><div class="glow"></div>
<div class="left"><div class="brand"><span class="mark">{MARK}</span>Home Surroundings Check</div>
<div class="eye">{html.escape(eyebrow)}</div><h1 class="{cls}">{html.escape(title)}</h1>{f'<div class="sub">{html.escape(sub)}</div>' if sub else ''}{stats}<div class="foot">{html.escape(foot)}</div></div>
<div class="right">{dots_svg(right_slug, home=home_pin)}{key}</div></body></html>"""

jobs = []
jobs.append(('home', page('FREE · U.S. HOMEBUYER TOOL', 'Check road traffic and rail activity around a home', 'Night trains, horn rules, road counts and flood zones for any U.S. address.', 'chicago-il', home_pin=True)))
jobs.append(('trains', page('TRAIN ACTIVITY BY CITY', f'Train activity in {len(cities["cities"])} U.S. cities', 'Crossing maps, night trains and quiet zones from federal railroad records.', 'houston-tx')))
for slug, c in cities['cities'].items():
    s = summary[slug]; qz = s['qz24'] + s['qzP'] + s['qzC']
    pct = lambda a: round(a / s['n'] * 100) if s['n'] else 0
    stats = f'<div class="stats"><div class="st"><b>{s["n"]:,}</b><span>public crossings</span></div><div class="st n"><b>{pct(s["night"])}%</b><span>night trains</span></div><div class="st q"><b>{pct(qz)}%</b><span>quiet zone</span></div></div>'
    jobs.append((f'trains-{slug}', page(f'{c["name"].upper()}, {c["st"]} · FRA RECORDS', f'Trains near a {c["name"]} home', '', slug, stats=stats, foot='FRA Crossing Inventory · mapped crossings')))
ROAD = {'road-traffic-by-address', 'noise-near-an-address', 'compare-homes-road-and-rail', 'nyc-noise-complaints-by-address'}
for f in sorted(glob.glob(f'{ROOT}/*/index.html')):
    slug = f.split('/')[-2]
    s = open(f).read()
    if 'class="gv' not in s: continue
    h1 = html.unescape(re.sub(r'<[^>]+>', '', re.search(r'<h1[^>]*>(.*?)</h1>', s, re.S).group(1))).strip()
    eye = html.unescape(re.sub(r'<[^>]+>', '', (re.search(r'<div class="eyebrow">(.*?)</div>', s) or [None, 'HOMEBUYER GUIDE'])[1]))
    jobs.append((f'guide-{slug}', page(eye, h1, '', 'houston-tx' if slug in ROAD else 'dallas-tx' if 'freight' in slug or 'train' in slug else 'chicago-il')))

posts = json.load(open(f'{ROOT}/data/blog/posts.json')) if os.path.exists(f'{ROOT}/data/blog/posts.json') else []
jobs.append(('blog', page('RAIL & ROAD WATCH', 'Train horn, quiet zone and weather news for homebuyers', 'Checked against federal records.', 'st-louis-mo')))
for po in posts:
    jobs.append((f'blog-{po["slug"]}', page('RAIL & ROAD WATCH', po['title'], '', po.get('city') or (po.get('cities') or ['houston-tx'])[0], foot='Home Surroundings Check · checked against federal records')))
THUMB_CSS = "*{box-sizing:border-box}body{margin:0;width:400px;height:400px;background:#0f1b33;font-family:PJS,sans-serif;overflow:hidden;position:relative}.glow{position:absolute;inset:0;background:radial-gradient(260px 220px at 60% 45%,rgba(36,81,230,.45),transparent 70%)}svg{position:absolute;left:0;top:0}.tag{position:absolute;left:0;right:0;bottom:0;background:#2451e6;color:#fff;font-weight:800;font-size:54px;letter-spacing:.02em;padding:16px 0 20px;text-align:center}"
thumbs = [(f'thumb-{po["slug"]}', f"<html><head><style>{FONTS}{THUMB_CSS}</style></head><body><div class='glow'></div>{dots_svg(po.get('city') or (po.get('cities') or ['houston-tx'])[0], w=400, h=310, r=11)}<div class='tag'>{html.escape(po.get('tag', 'NEWS'))}</div></body></html>") for po in posts]
ONLY = os.environ.get('ONLY')
if ONLY: jobs = [j for j in jobs if j[0].startswith(ONLY)]
os.makedirs(f'{ROOT}/og', exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome')
    pg = b.new_page(viewport={'width': 1200, 'height': 630})
    for name, doc in jobs:
        pg.set_content(doc); pg.wait_for_timeout(60)
        pg.screenshot(path=f'{ROOT}/og/{name}.jpg', type='jpeg', quality=80)
    pg.set_viewport_size({'width': 400, 'height': 400})
    for name, doc in thumbs:
        pg.set_content(doc); pg.wait_for_timeout(60)
        pg.screenshot(path=f'{ROOT}/og/{name}.jpg', type='jpeg', quality=82)
    b.close()
print(len(jobs), 'images')
