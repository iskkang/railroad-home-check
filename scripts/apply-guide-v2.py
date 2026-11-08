"""One-time restyle of the hand-written guide pages to the current design (idempotent).
Usage: python3 scripts/apply-guide-v2.py"""
import re, glob, json
FONT = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">'
photos = json.load(open('data/rail-cities/photos.json'))
PHOTO = {  # public-domain Highsmith photos (Library of Congress)
  'rail': ('dallas-tx', 'Freight yard in Dallas, Texas'),
  'tracks': ('chicago-il', 'Chicago skyline and train tracks'),
  'roads': ('houston-tx', 'Aerial view of Houston, Texas'),
}
TOPIC = {
  'buying-house-near-freight-railroad': 'rail', 'freight-train-noise-at-night': 'rail', 'how-many-trains-pass-near-my-house': 'rail',
  'railroad-crossing-accident-history': 'rail', 'railroad-vibration-homebuyer-checklist': 'rail', 'railroad-noise-home-inspection-checklist': 'rail',
  'road-traffic-by-address': 'roads', 'noise-near-an-address': 'roads', 'compare-homes-road-and-rail': 'roads', 'nyc-noise-complaints-by-address': 'roads',
}
MARK = '<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M5 18 20 6l15 12M10 16v18h20V16M16 34V23h8v11" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'
HEADER = f'<header class="site-header"><a class="brand" href="/">{MARK}<span>Home Surroundings Check</span></a><nav class="gv-nav" aria-label="Main"><a href="/trains/">Cities</a><a href="/guides/">Guides</a><a class="gv-nav-data" href="/home-surroundings-data/">Data &amp; coverage</a></nav></header>'
def form(fid, label):
    return (f'<form class="gv-search" action="/" role="search"><label for="{fid}">{label}</label>'
            f'<input id="{fid}" name="address" type="text" autocomplete="street-address" placeholder="Enter a U.S. property address" required>'
            f'<button type="submit">Check this address</button></form>')
changed = []
for f in sorted(glob.glob('*/index.html')):
    s = open(f).read()
    if 'guides.css' not in s or f.startswith('trains/') or 'class="gv"' in s: continue
    slug = f.split('/')[0]
    key, alt = PHOTO[TOPIC.get(slug, 'tracks')]
    p = photos[key]
    s = re.sub(r'<link[^>]*fonts\.googleapis\.com/css2[^>]*>', '', s)
    s = re.sub(r'<link rel="preconnect" href="https://fonts\.g[^"]*"[^>]*>', '', s)
    s = s.replace('</head>', FONT + '<link rel="stylesheet" href="/guide-v2.css"><script defer src="/guide-ui.js"></script></head>', 1)
    s = s.replace('<body>', '<body class="gv">', 1)
    s = re.sub(r'<header class="site-header">.*?</header>', HEADER, s, count=1, flags=re.S)
    hero_open = '<section class="guide-hero">'
    i = s.index(hero_open); j = s.index('</section>', i)
    inner = s[i + len(hero_open):j]
    inner = re.sub(r'<p><a class="guide-quick-check" href="/">[^<]*</a></p>', form('gv-addr', 'Check a U.S. property address'), inner)
    credit = (f'<p class="gv-credit">Photo: {alt}, {p["author"]}, Library of Congress '
              f'(<a href="{p["page"]}" rel="noopener">public domain</a>)</p>')
    s = s[:i] + hero_open + f'<img class="gv-photo" src="{p["src"]}" alt="" fetchpriority="high" decoding="async"><div class="gv-shade" aria-hidden="true"></div><div class="gv-in">' + inner + credit + '</div>' + s[j:]
    s = s.replace('<a class="guide-button" href="/">Check an address</a>', form('gv-addr-cta', 'Property address'), 1)
    s = s.replace('</body>', '<a class="gv-sticky" href="/">Check an address</a></body>', 1)
    open(f, 'w').write(s); changed.append(f)
print(len(changed), 'pages updated')
