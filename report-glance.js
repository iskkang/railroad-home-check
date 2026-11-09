// "At a glance" summary for the address report.
// app.js calls ReportGlance.start/rail/roads/night/context as each source loads.
// Everything shown here is already on the page; this only reorganizes it.
(() => {
  'use strict';
  const MOBILE = window.matchMedia('(max-width: 700px)');
  let state = null;

  const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtMi = mi => (mi < 0.1 ? `${Math.round(mi * 5280)} ft` : `${mi.toFixed(2)} mi`);
  const fmtM = m => fmtMi(m / 1609.344);
  const num = v => Number(v).toLocaleString('en-US');
  const title = t => { const x = String(t || '').trim(); return x && x === x.toUpperCase() ? x.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()) : x; };
  const rr = n => String(n || '').replace(/ (Railroad|Railway) Company$/i, '').replace(/ Transportation$/, '') || 'Railroad n/a';
  const qzText = q => ({ '0': 'Not a quiet zone', '1': '24-hour quiet zone', '2': 'Partial quiet zone', '3': 'Chicago-excused' })[String(q?.code ?? '')] || 'Quiet zone not reported';
  const trains = c => { const d = Number(c.dayTrains) || 0, n = Number(c.nightTrains) || 0; if (!d && !n && c.lessThanOne) return 'Under 1 train/day reported'; return `${count(c.dayTrains, c.lessThanOne, c.weeklyTrains)} day / ${count(c.nightTrains, c.lessThanOne, c.weeklyTrains)} night trains`; };
  const segName = n => (/^\d+[a-z]?$/i.test(String(n)) ? `Segment ${n}` : String(n));
  const count = (v, lt1, wk) => (v !== null && v !== undefined && v !== '' ? String(v) : lt1 ? '<1/day' : wk ? `${wk}/wk` : '—');

  // Federal train horn rule (49 CFR 222): outside quiet zones, horns sound for 15-20 s before every
  // public at-grade crossing, starting no more than 1/4 mile out, at 96-110 dB(A) measured 100 ft ahead.
  const runsTrains = c => (Number(c.dayTrains) || 0) > 0 || (Number(c.nightTrains) || 0) > 0 || c.lessThanOne || (Number(c.weeklyTrains) || 0) > 0;
  const hornCrossing = c => c && c.isPublic !== false && !['1', '3'].includes(String(c.quietZone?.code ?? '')) && runsTrains(c);
  const nightHornCrossing = c => hornCrossing(c) && String(c.quietZone?.code ?? '') !== '2' && (Number(c.nightTrains) || 0) > 0;
  const perDay = c => (Number(c.dayTrains) || 0) + (Number(c.nightTrains) || 0) || ((Number(c.weeklyTrains) || 0) / 7) || (c.lessThanOne ? 0.5 : 0);
  function hornAssess(crossings = []) {
    const horns = crossings.filter(hornCrossing);
    const within1 = horns.filter(c => c.distanceMiles <= 1);
    const nightWithin1 = within1.filter(nightHornCrossing);
    const maxNight = nightWithin1.reduce((m, c) => Math.max(m, Number(c.nightTrains) || 0), 0);
    // Grade by the nearest horn crossing with at least 1 train/day; a barely used spur closer in is noted, not decisive.
    const busy = horns.find(c => perDay(c) >= 1);
    const nearest = horns[0];
    const near = busy || nearest;
    const d = busy ? busy.distanceMiles : Infinity;
    const level = d <= 0.25 ? { key: 'loud', badge: 'CHECK ON SITE', tone: 'warn', v: 'Crossing within 0.25 mi — verify horn exposure' }
      : d <= 0.5 ? { key: 'likely', badge: 'VERIFY', tone: 'warn', v: 'Crossing within 0.5 mi — check on site' }
      : d <= 1 ? { key: 'possible', badge: 'VERIFY', tone: 'neutral', v: 'Crossing within 1 mi — verify local conditions' }
      : { key: 'unlikely', badge: 'LIMITED DATA', tone: 'ok', v: 'No frequently used horn crossing within 1 mi identified' };
    if (!busy && nearest && nearest.distanceMiles <= 1) Object.assign(level, { key: 'rare', badge: 'LOW FREQUENCY', tone: 'neutral', v: `Low reported train frequency at crossing ${fmtMi(nearest.distanceMiles)} away; verify on site` });
    const rareCloser = busy && nearest && nearest !== busy && nearest.distanceMiles < busy.distanceMiles ? nearest : null;
    return { level, near, rareCloser, horns, within1, nightWithin1, maxNight };
  }

  const ICON = {
    rail: '<path d="M4 21 9 3"/><path d="M20 21 15 3"/><path d="M6 15h12"/><path d="M7 10h10"/><path d="M8 6h8"/>',
    cross: '<path d="M5 5l14 14"/><path d="M19 5 5 19"/>',
    horn: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 6a8.5 8.5 0 0 1 0 12"/>',
    road: '<path d="M8 3 4 21"/><path d="m16 3 4 18"/><path d="M12 5v2"/><path d="M12 11v2"/><path d="M12 17v2"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
    flood: '<path d="M3 15c2 0 2-1.5 4.5-1.5S9.5 15 12 15s2.5-1.5 4.5-1.5S19 15 21 15"/><path d="M3 19.5c2 0 2-1.5 4.5-1.5s2 1.5 4.5 1.5 2.5-1.5 4.5-1.5 2.5 1.5 4.5 1.5"/><path d="M12 3 7.5 9.5a4.5 4.5 0 0 0 9 0Z"/>',
    hazard: '<path d="M12 2v2M4.9 4.9l1.4 1.4M2 12h2M19.1 4.9l-1.4 1.4M22 12h-2"/><path d="M8 12a4 4 0 0 1 8 0"/><path d="M6 17h12M8 21h8"/>',
    site: '<path d="M3 21V9l6 4V9l6 4V5h6v16Z"/>',
    noise: '<path d="M3 10v4"/><path d="M7 7v10"/><path d="M11 4v16"/><path d="M15 8v8"/><path d="M19 10v4"/>'
  };
  const icon = n => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

  function panel() {
    let el = document.getElementById('glancePanel');
    if (!el) {
      el = document.createElement('section');
      el.id = 'glancePanel';
      el.className = 'report-glance';
      el.setAttribute('aria-label', 'Report summary');
      const anchor = document.querySelector('#results .topic-tabs');
      anchor.parentNode.insertBefore(el, anchor);
    }
    return el;
  }

  function row({ ic, tone, k, v, note, badge, btone, action }) {
    return `<li class="g-row${state?.openRows?.has(k) ? ' g-open' : ''}" data-k="${esc(k)}"><span class="g-ico g-${tone}">${icon(ic)}</span><div class="g-body"><div class="g-top"><span class="g-k">${esc(k)}</span>${badge ? `<span class="g-badge g-${btone || tone}">${esc(badge)}</span>` : ''}</div><div class="g-v">${v}</div>${note ? `<details class="g-source"><summary>Source &amp; limitations</summary><div class="g-note">${note}</div></details>` : ''}${action || ''}</div></li>`;
  }

  function railRow(s) {
    if (s.rail === undefined) return row({ ic: 'rail', tone: 'neutral', k: 'Mapped rail line', v: 'Checking…' });
    if (s.rail === 'error') return row({ ic: 'rail', tone: 'neutral', k: 'Mapped rail line', v: 'Unavailable', note: 'Retry under Rail lines &amp; crossing records' });
    if (!Number.isFinite(Number(s.rail)) || s.rail > 5230.368) return row({ ic: 'rail', tone: 'ok', k: 'Mapped rail line', v: 'None within 3.25 mi', note: 'Mapped centerlines only; not proof of no tracks', badge: 'NONE MAPPED' });
    const close = s.rail <= 402.336, near = s.rail <= 804.672;
    return row({ ic: 'rail', tone: close ? 'warn' : near ? 'neutral' : 'ok', k: 'Mapped rail line', v: esc(fmtM(s.rail)), note: 'Track centerline · operating status not verified', badge: close ? 'CLOSE' : near ? 'NEARBY' : 'FARTHER' });
  }

  function crossingRows(r) {
    const list = r.crossings || [];
    const c = list.find(x => x.isPublic !== false) || list[0];
    if (!c) return row({ ic: 'cross', tone: 'neutral', k: 'Nearest public crossing', v: 'None within 3.25 mi', note: 'No open at-grade FRA crossing returned. Tracks or trains may still be nearby.', badge: 'NONE RETURNED' }) + hornRow(r);
    const night = Number(c.nightTrains) || 0, day = Number(c.dayTrains) || 0;
    const badge = night > 0 ? ['NIGHT TRAINS', 'warn'] : day > 0 ? ['DAY TRAINS ONLY', 'neutral'] : ['VERIFY ON SITE', 'neutral'];
    return row({ ic: 'cross', tone: badge[1], k: 'Nearest public crossing', v: `${esc(fmtMi(c.distanceMiles))} · ${esc(title(c.street || c.city || 'Crossing ' + (c.crossingId || '')))}`, note: `${esc(trains(c))}${c.trainCountYear ? ` · ${esc(c.trainCountYear)} count` : ''} · ${esc(qzText(c.quietZone))} · ${esc(rr(c.railroadName || c.railroadCode))}`, badge: badge[0] })
      + hornRow(r);
  }

  function hornRow(r) {
    const h = hornAssess(r.crossings || []);
    let note;
    if (!h.near) note = 'No public crossing within 3.25 mi where horns are routinely sounded';
    else {
      const where = `${fmtMi(h.near.distanceMiles)} from ${title(h.near.street || 'a public crossing')}${String(h.near.quietZone?.code) === '2' ? ' (partial quiet zone)' : ''}`;
      const rare = h.rareCloser ? ` · closer crossing at ${fmtMi(h.rareCloser.distanceMiles)} sees under 1 train/day` : '';
      const nightTxt = h.nightWithin1.length ? ` · up to ${h.maxNight} night ${h.maxNight === 1 ? 'train' : 'trains'} at ${h.nightWithin1.length} horn ${h.nightWithin1.length === 1 ? 'crossing' : 'crossings'} within 1 mi` : h.within1.length ? ' · no night trains reported at horn crossings within 1 mi' : '';
      note = esc(where + nightTxt + rare);
    }
    note += '<br><span class="g-why">Federal horn rules apply at many public crossings outside quiet zones. This is a distance-based screening flag, not an estimate of sound at the property. Terrain, buildings, operations and local exceptions matter.</span>';
    return row({ ic: 'horn', tone: h.level.tone, k: 'Train horns at this home', v: esc(h.level.v), note, badge: h.level.badge });
  }

  function floodRow(s) {
    const f = s.flood;
    if (f === undefined) return row({ ic: 'flood', tone: 'neutral', k: 'FEMA flood zone', v: 'Checking…' });
    const addr = s.report.matchedAddress || s.report.address || '';
    const link = `<a href="https://msc.fema.gov/portal/search?AddressQuery=${encodeURIComponent(addr)}" target="_blank" rel="noopener">Official FEMA map</a>`;
    if (f === 'error') return row({ ic: 'flood', tone: 'neutral', k: 'FEMA flood zone', v: 'Unavailable', note: `FEMA data did not respond · ${link}`, badge: 'RETRY LATER' });
    const t = {
      high: ['warn', 'HIGH RISK', '1% yearly chance of flooding. Lenders require flood insurance on federally backed mortgages here.'],
      moderate: ['neutral', 'MODERATE', '0.2% yearly chance area. Insurance is optional but worth pricing.'],
      minimal: ['ok', 'LOW', 'Low risk on FEMA maps. Floods can still happen outside mapped zones.'],
      undetermined: ['neutral', 'UNDETERMINED', 'Possible flood risk that FEMA has not studied.'],
      unverified: ['neutral', 'UNVERIFIED', 'The primary FEMA map was unavailable. The reduced backup omits low-risk and unmapped areas; absence of a polygon cannot establish low flood risk. Check the official map.'],
      unmapped: ['neutral', 'NO MAP', 'FEMA has no digital flood map for this spot.']
    }[f.level] || ['neutral', 'CHECK', ''];
    const bfe = f.bfe !== null && f.bfe !== undefined ? ` Base flood elevation ${f.bfe} ft.` : '';
    return row({ ic: 'flood', tone: t[0], k: 'FEMA flood zone', v: esc(f.label), note: `${esc(t[2] + bfe)} · ${link}`, badge: t[1] });
  }

  // FEMA National Risk Index, census tract: which weather hazards rate higher here than in most of the U.S.
  const HAZ_NAMES = { hwav: 'Heat wave', cwav: 'Cold wave', wntw: 'Winter storms', istm: 'Ice storms', hrcn: 'Hurricanes', trnd: 'Tornadoes', ifld: 'River flooding', cfld: 'Coastal flooding', wfir: 'Wildfire' };
  const RANK = { 'Very High': 5, 'Relatively High': 4, 'Relatively Moderate': 3, 'Relatively Low': 2, 'Very Low': 1 };
  function hazardRow(s) {
    const h = s.hazard;
    if (h === undefined) return row({ ic: 'hazard', tone: 'neutral', k: 'Weather & natural hazards', v: 'Checking…' });
    if (h === 'error' || !h.tract) return row({ ic: 'hazard', tone: 'neutral', k: 'Weather & natural hazards', v: 'Unavailable', note: 'FEMA National Risk Index did not respond for this point', badge: 'RETRY LATER' });
    const list = Object.entries(h.hazards || {}).filter(([, v]) => RANK[v]).sort((a, b) => RANK[b[1]] - RANK[a[1]]);
    const high = list.filter(([, v]) => RANK[v] >= 4).map(([k]) => HAZ_NAMES[k]);
    const v = high.length ? `Higher than most of the U.S.: ${high.slice(0, 3).join(', ')}` : 'No hazard rated high for this neighborhood';
    const note = list.slice(0, 6).map(([k, r]) => `${HAZ_NAMES[k]}: ${r.replace('Relatively ', '')}`).join(' · ');
    return row({ ic: 'hazard', tone: high.length ? 'warn' : 'ok', k: 'Weather & natural hazards', v: esc(v), note: `${esc(note)}<br><span class="g-why">FEMA National Risk Index, census tract ${esc(h.tract)}. Ratings compare risk with other U.S. tracts; they are not an insurance or flood determination.</span>`, badge: high.length ? `${high.length} HIGHER` : 'LOWER' });
  }

  // USDOT/BTS National Transportation Noise Map 2020: modeled 24-hour average (LAeq) outdoors, by legend band.
  const NOISE_LEVEL = [
    ['ok', 'QUIET', 'Quiet', 'Nothing modeled at 45 dB or louder from roads, rail or aircraft'],
    ['ok', 'LOW', 'Low', 'Background level, around the hum of a refrigerator'],
    ['ok', 'LOW', 'Low', 'Background level, around the hum of a refrigerator'],
    ['neutral', 'MODERATE', 'Moderate', 'Noticeable outdoors; at or above the 55 dB outdoor level in EPA\'s 1974 noise guidance'],
    ['warn', 'LOUD', 'Loud', 'Typical next to a busy road or active rail line'],
    ['warn', 'VERY LOUD', 'Very loud', 'Typical right beside a highway, rail yard or airport'],
    ['warn', 'VERY LOUD', 'Very loud', 'Typical right beside a highway, rail yard or airport'],
    ['warn', 'VERY LOUD', 'Very loud', 'Typical right beside a highway, rail yard or airport']
  ];
  function noiseRow(s) {
    const n = s.noise, K = 'Transportation noise';
    if (n === undefined) return row({ ic: 'noise', tone: 'neutral', k: K, v: 'Checking…' });
    if (n === 'error') return row({ ic: 'noise', tone: 'neutral', k: K, v: 'Unavailable', note: 'The USDOT noise map did not respond', badge: 'RETRY LATER' });
    if (!n.region || !n.all) return row({ ic: 'noise', tone: 'neutral', k: K, v: 'Not covered', note: 'The USDOT noise map does not cover this location' });
    const L = NOISE_LEVEL[n.all.band] || NOISE_LEVEL[0];
    const src = [['Road', n.road], ['Rail', n.rail], ['Aircraft', n.aviation]].filter(([, x]) => x);
    const top = Math.max(...src.map(([, x]) => x.band));
    const from = top > 0 ? ` · mostly ${src.filter(([, x]) => x.band === top).map(([k]) => k.toLowerCase()).join(' and ')}` : '';
    const v = n.all.band ? `${n.all.label} average · ${L[2]}${from}` : 'Below 45 dB average · Quiet';
    const parts = n.all.band ? src.map(([k, x]) => `${k}: ${x.band ? x.label : 'below 45 dB'}`).join(' · ') : '';
    const why = `USDOT 2020 noise map: a modeled 24-hour average outdoors on a ~30 m grid. Short events such as horns or flyovers are averaged in, so peaks are much louder. Not a measurement at this home.`;
    return row({ ic: 'noise', tone: L[0], k: K, v: esc(v), note: `${esc(L[3])}.${parts ? ` ${esc(parts)}` : ''}<br><span class="g-why">${esc(why)}</span>`, badge: L[1] });
  }

  function roadRow(s) {
    if (s.roads === undefined) return row({ ic: 'road', tone: 'neutral', k: 'Nearest counted road', v: 'Checking…' });
    if (s.roads === 'error') return row({ ic: 'road', tone: 'neutral', k: 'Nearest counted road', v: 'Unavailable', note: 'Retry under Road traffic' });
    if (!s.roads.length) return row({ ic: 'road', tone: 'neutral', k: 'Nearest counted road', v: 'No counts within 1 mi', note: 'Smaller streets often have no reported count' });
    const n = s.roads[0], v = Number(n.a.AADT);
    const busiest = s.roads.filter(x => x.meters <= 482.8).reduce((m, x) => (Number(x.a.AADT) > Number(m.a.AADT) ? x : m), n);
    const band = v < 5000 ? ['LIGHT', 'ok'] : v < 15000 ? ['MODERATE', 'blue'] : v < 30000 ? ['BUSY', 'warn'] : ['VERY BUSY', 'warn'];
    const extra = busiest !== n ? ` · busiest within 0.3 mi: ${num(busiest.a.AADT)}/day` : '';
    return row({ ic: 'road', tone: band[1], k: 'Nearest counted road', v: `${num(v)} vehicles/day`, note: `${esc(fmtM(n.meters))} away · ${esc(n.a.DATA_YEAR || 'year n/a')} count${esc(extra)}`, badge: band[0] });
  }

  function nightRow(s) {
    if (s.night === undefined) return row({ ic: 'moon', tone: 'neutral', k: 'Road traffic at night', v: 'Checking…' });
    if (s.night === 'error') return row({ ic: 'moon', tone: 'neutral', k: 'Road traffic at night', v: 'Unavailable', note: 'Retry under Hourly road patterns' });
    if (s.night === null) return row({ ic: 'moon', tone: 'neutral', k: 'Road traffic at night', v: 'No reference station', note: 'No usable station within 10 miles' });
    return row({ ic: 'moon', tone: 'neutral', k: 'Road traffic at night', v: `${s.night.pct.toFixed(0)}% of the daily total`, note: `10 PM–6 AM · reference station ${s.night.miles.toFixed(1)} mi away · same road not verified`, badge: 'REFERENCE' });
  }

  function siteRow(s) {
    const r = s.report, ctx = r.nearbyContext, resp = ctx?.responses || {};
    const fac = resp.facilities, epa = resp.epa;
    if (!fac && !epa) {
      const busy = ctx && (ctx.requests?.facilities || ctx.requests?.epa);
      return row({ ic: 'site', tone: 'neutral', k: 'Nearby facilities', v: busy ? 'Checking…' : 'Not checked yet', note: 'Waste sites, industrial uses and EPA air facilities', action: busy ? '' : '<button type="button" class="g-btn" data-glance="living">Check nearby facilities</button>' });
    }
    const items = (fac?.items || []);
    const waste = items.filter(i => i.category === 'odor').length, ind = items.filter(i => i.category === 'industrial').length, air = (epa?.items || []).length;
    const parts = [fac ? `${waste} waste site${waste === 1 ? '' : 's'}` : null, fac ? `${ind} industrial` : null, epa ? `${air} EPA air` : null].filter(Boolean);
    const any = waste + ind + air > 0;
    return row({ ic: 'site', tone: any ? 'warn' : 'ok', k: 'Nearby facilities', v: esc(parts.join(' · ')), note: 'Within about ½ mi (EPA: 1 mi) · presence is not exposure', badge: any ? 'CHECK' : 'NONE RETURNED' });
  }

  function nearList(s) {
    const r = s.report, items = [];
    (r.crossings || []).filter(c => c.distanceMiles <= 0.75).slice(0, 5).forEach(c => items.push({ d: c.distanceMiles, t: `${title(c.street || c.city || 'Rail')} crossing`, s: `${rr(c.railroadName || c.railroadCode)} · ${trains(c)} · ${qzText(c.quietZone)}`, k: 'x' }));
    if (typeof s.rail === 'number' && Number.isFinite(s.rail) && s.rail <= 1207) items.push({ d: s.rail / 1609.344, t: 'Mapped rail line', s: 'Centerline · status not verified', k: 'r' });
    if (Array.isArray(s.roads) && s.roads.length) {
      const near = s.roads.filter(x => x.meters <= 1207);
      if (near[0]) items.push({ d: near[0].meters / 1609.344, t: `Road · ${num(near[0].a.AADT)} vehicles/day`, s: `${segName(near[0].name)} · ${near[0].a.DATA_YEAR || 'year n/a'} count`, k: 'd' });
      const big = near.reduce((m, x) => (!m || Number(x.a.AADT) > Number(m.a.AADT) ? x : m), null);
      if (big && big !== near[0]) items.push({ d: big.meters / 1609.344, t: `Busiest road · ${num(big.a.AADT)} vehicles/day`, s: `${segName(big.name)} · ${big.a.DATA_YEAR || 'year n/a'} count`, k: 'd' });
    }
    if (!items.length) return '';
    items.sort((a, b) => a.d - b.d);
    const MAXN = 4, open = s.nearOpen;
    const more = items.length > MAXN ? `<button type="button" class="g-more" data-glance="near-more">${open ? 'Show fewer' : `Show all ${items.length}`}</button>` : '';
    return `<div class="g-near${open ? ' g-near-open' : ''}"><h3>What's within ¾ mile</h3><p class="g-sub">Nearest first, from the approximate property pin.</p><ol>${items.map((i, n) => `<li class="g-n-${i.k}${n >= MAXN ? ' g-extra' : ''}"><span class="g-d">${esc(fmtMi(i.d))}</span><span class="g-dot" aria-hidden="true"></span><div><strong>${esc(i.t)}</strong><span>${esc(i.s)}</span></div></li>`).join('')}</ol>${more}</div>`;
  }

  function render() {
    if (!state) return;
    const el = panel();
    el.innerHTML = `<div class="g-head"><h3>Your surroundings at a glance</h3><p class="g-sub">Four starting points. Open each source note before drawing a conclusion.</p></div><ul class="g-list">${railRow(state)}${roadRow(state)}${noiseRow(state)}${floodRow(state)}</ul><nav class="g-jump" aria-label="Jump to report section"><a href="#propertyMap" data-glance="map">Explore map ↓</a><a href="#paneRail" data-glance="pane">Rail details</a><a href="#paneRoad" data-glance="pane">Road details</a><a href="#topicliving" data-glance="living">Nearby facilities</a></nav>`;
    const insights = document.getElementById('mapInsights');
    if (insights) {
      insights.innerHTML = `<div class="insight-head"><span class="panel-kicker">READ THE MAP</span><h3>Key takeaways</h3><p>Distances start at your approximate property pin.</p></div>${nearList(state)}<details class="more-findings"><summary>Crossings, horns &amp; other checks</summary><ul class="g-list">${crossingRows(state.report)}${hazardRow(state)}${nightRow(state)}${siteRow(state)}</ul></details><p class="insight-note">ⓘ Public records and modeled estimates are not a measurement at this home. Confirm the pin and visit at different times.</p>`;
      if (!insights.dataset.bound) { insights.addEventListener('click', onClick); insights.dataset.bound = '1'; }
    }
    updateSummaries(state);
  }

  // One-line result in each collapsed "Look closer" section, so the sections can stay closed.
  function setSum(id, text) {
    const sum = document.querySelector(`#${id} > summary`);
    if (!sum) return;
    let n = sum.querySelector('.sum-note');
    if (!n) { n = document.createElement('span'); n.className = 'sum-note'; sum.append(n); }
    n.textContent = text || '';
  }
  function updateSummaries(s) {
    const roads = Array.isArray(s.roads) ? s.roads : null;
    if (roads && roads.length) {
      const near = roads[0], busy = roads.filter(r => r.meters <= 482.8).sort((a, b) => b.a.AADT - a.a.AADT)[0];
      setSum('paneRoad', `Nearest ${num(near.a.AADT)}/day${busy && busy !== near ? ` · busiest nearby ${num(busy.a.AADT)}/day` : ''}`);
    } else setSum('paneRoad', s.roads === 'error' ? 'Unavailable' : roads ? 'No counted roads within 1 mi' : '');
    const cr = s.report.crossings || [];
    const pub = cr.find(c => c.isPublic !== false);
    setSum('paneRail', cr.length ? `${cr.length} crossings within 3.25 mi${pub ? ` · nearest public ${fmtMi(pub.distanceMiles)}` : ''}` : 'No crossings returned');
    const n = s.night;
    setSum('paneHourly', n && n !== 'error' && Number.isFinite(n.pct) ? `${Math.round(n.pct)}% of daily traffic 10 PM–6 AM` : '');
  }

  function onClick(e) {
    if (!state) return;
    const rowEl = e.target.closest('.g-row');
    if (rowEl && !e.target.closest('a,button')) {
      state.openRows = state.openRows || new Set();
      const k = rowEl.dataset.k; rowEl.classList.toggle('g-open');
      if (rowEl.classList.contains('g-open')) state.openRows.add(k); else state.openRows.delete(k);
      return;
    }
    const a = e.target.closest('[data-glance]');
    if (!a) return;
    if (a.dataset.glance === 'near-more') { e.preventDefault(); state.nearOpen = !state.nearOpen; render(); return; }
    e.preventDefault();
    const kind = a.dataset.glance;
    if (kind === 'living') {
      const tab = document.getElementById('topicliving');
      tab?.click();
      document.querySelector('#results .topic-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(render, 300);
      return;
    }
    if (kind === 'map') {
      document.getElementById('topicsound')?.click();
      document.querySelector('#results .map-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    document.getElementById('topicsound')?.click();
    const target = document.querySelector(a.getAttribute('href'));
    if (target) { if (target.tagName === 'DETAILS') target.open = true; target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }

  function actionBar() {
    if (document.getElementById('reportActionBar')) return;
    const bar = document.createElement('div');
    bar.id = 'reportActionBar';
    bar.className = 'report-actionbar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Report actions');
    bar.innerHTML = '<button type="button" data-for="addCompare">Compare</button><button type="button" data-for="shareReport">Share</button><button type="button" data-for="printReport" class="primary">Save PDF</button>';
    bar.addEventListener('click', e => { const b = e.target.closest('button[data-for]'); if (b) document.getElementById(b.dataset.for)?.click(); });
    document.body.append(bar);
  }

  // One-page printable summary ("Save PDF"): address, map, the at-a-glance rows and what's within 3/4 mile.
  function buildSheet() {
    const s = state, r = s.report;
    let el = document.getElementById('printSheet');
    if (el) { el._map?.remove(); el.remove(); }
    el = document.createElement('section');
    el.id = 'printSheet';
    el.className = 'print-sheet';
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    el.innerHTML = `<header class="ps-head"><div><div class="ps-brand">Home Surroundings Check</div><h1>${esc(r.matchedAddress || '')}</h1></div><div class="ps-date">Summary · ${esc(date)}<br>railroad-home-check.vercel.app</div></header>
      <div class="ps-map" id="printSheetMap"></div>
      <div class="ps-key"><span><i class="cat-dot cat-night"></i>Night trains</span><span><i class="cat-dot cat-qz"></i>Quiet zone</span><span><i class="cat-dot cat-day"></i>Daytime only</span><span><i class="cat-dot cat-none"></i>No count</span><span><i class="horn-key"></i>Horn zone (¼ mi)</span></div>
      <ul class="g-list ps-list">${railRow(s)}${crossingRows(r)}${noiseRow(s)}${floodRow(s)}${hazardRow(s)}${roadRow(s)}${nightRow(s)}${(s.report.nearbyContext?.responses?.facilities || s.report.nearbyContext?.responses?.epa) ? siteRow(s) : ''}</ul>
      ${nearList(s)}
      <footer class="ps-foot">Sources: FRA Crossing Inventory (Form 71), FHWA HPMS road counts, FEMA National Flood Hazard Layer, OpenStreetMap. Reported data with its own dates; not a noise measurement, flood determination, appraisal or inspection. Distances are straight-line from an approximate geocoded point.</footer>`;
    el.querySelectorAll('.g-btn').forEach(b => b.remove());
    document.body.append(el);
    return el;
  }

  function sheetMap(el) {
    return new Promise(resolve => {
      const r = state.report, host = el.querySelector('#printSheetMap');
      if (!window.L || !Number.isFinite(r.lat)) { host.remove(); return resolve(); }
      const map = L.map(host, { zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false, zoomSnap: 0.25, fadeAnimation: false, zoomAnimation: false });
      el._map = map;
      map.attributionControl.setPrefix(false);
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
      const home = [r.lat, r.lon], pts = [home];
      const near = (r.crossings || []).filter(c => Number.isFinite(c.lat) && c.distanceMiles <= 1).slice(0, 12);
      near.filter(hornCrossing).forEach(c => {
        const busy = perDay(c) >= 1;
        L.circle([c.lat, c.lon], { radius: 402.336, stroke: !busy, color: '#e8590c', weight: 1, dashArray: '2 4', fill: busy, fillColor: '#e8590c', fillOpacity: 0.1, interactive: false }).addTo(map);
      });
      near.forEach((c, i) => {
        pts.push([c.lat, c.lon]);
        const cat = globalThis.crossingCategory ? globalThis.crossingCategory(c).key : 'none';
        L.marker([c.lat, c.lon], { interactive: false, icon: L.divIcon({ className: `crossing-dot cat-${cat}${i === 0 ? ' nearest-pin' : ''}`, html: i === 0 ? '<span>Nearest</span>' : '', iconSize: i === 0 ? [20, 20] : [14, 14] }) }).addTo(map);
      });
      L.marker(home, { interactive: false, icon: L.divIcon({ className: 'home-pin', html: 'H', iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(map);
      if (pts.length > 1) map.fitBounds(pts, { padding: [28, 28], maxZoom: 16 }); else map.setView(home, 15);
      let done = false; const finish = () => { if (!done) { done = true; resolve(); } };
      tiles.on('load', () => setTimeout(finish, 250));
      setTimeout(finish, 4500);
    });
  }

  async function printSheet(e) {
    const t = e.target.closest('#printReport');
    if (!t || !state) return;
    e.preventDefault(); e.stopPropagation();
    if (t.dataset.busy) return;
    t.dataset.busy = '1';
    const label = t.textContent; t.textContent = 'Preparing PDF…';
    try {
      const el = buildSheet();
      document.body.classList.add('ps-preparing');
      await sheetMap(el);
      document.body.classList.add('ps-print');
      const cleanup = () => document.body.classList.remove('ps-print', 'ps-preparing');
      window.addEventListener('afterprint', cleanup, { once: true });
      setTimeout(cleanup, 120000);
      window.print();
    } finally {
      t.textContent = label; delete t.dataset.busy;
    }
  }
  document.addEventListener('click', printSheet, true);

  function tidyMapCard() {
    const map = document.querySelector('.map-panel');
    const ctx = document.getElementById('contextControls');
    if (ctx && !ctx.closest('.ctx-more')) {
      const d = document.createElement('details'); d.className = 'ctx-more';
      d.innerHTML = '<summary>More map layers <span class="sum-note">airports, aviation noise, venues, emergency</span></summary>';
      ctx.before(d); d.append(ctx);
      // Collapsed on the Sound tab only; the Living environment / Local records tabs are made of these layers.
      document.querySelector('.topic-tabs')?.addEventListener('click', e => {
        const t = e.target.closest('[role="tab"]'); if (!t) return;
        d.open = t.id !== 'topicsound';
        d.querySelector('summary').firstChild.textContent = t.id === 'topicsound' ? 'More map layers ' : 'Map layers ';
      });
    }
    if (map && !map.querySelector('.map-notes')) {
      const legend = map.querySelector('.traffic-legend'), notice = document.getElementById('mapNotice');
      const d = document.createElement('details'); d.className = 'map-notes';
      d.innerHTML = '<summary>Road colors &amp; data notes</summary>';
      (legend || notice)?.before(d);
      if (legend) d.append(legend);
      if (notice) d.append(notice);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tidyMapCard); else tidyMapCard();

  window.ReportGlance = {
    start(report) {
      state = { report, rail: undefined, roads: undefined, night: undefined, flood: undefined, hazard: undefined, noise: undefined };
      fetch(`/api/risk?lat=${encodeURIComponent(report.lat)}&lon=${encodeURIComponent(report.lon)}`, { signal: AbortSignal.timeout(15000) })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then(d => { report.hazard = d; if (state?.report === report) { state.hazard = d; render(); } })
        .catch(() => { report.hazard = 'error'; if (state?.report === report) { state.hazard = 'error'; render(); } });
      fetch(`/api/noise?lat=${encodeURIComponent(report.lat)}&lon=${encodeURIComponent(report.lon)}`, { signal: AbortSignal.timeout(15000) })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then(d => { report.noise = d; if (state?.report === report) { state.noise = d; render(); } })
        .catch(() => { report.noise = 'error'; if (state?.report === report) { state.noise = 'error'; render(); } });
      fetch(`/api/flood?lat=${encodeURIComponent(report.lat)}&lon=${encodeURIComponent(report.lon)}`, { signal: AbortSignal.timeout(20000) })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then(d => { report.flood = d; if (state?.report === report) { state.flood = d; render(); } })
        .catch(() => { report.flood = 'error'; if (state?.report === report) { state.flood = 'error'; render(); } });
      const el = panel();
      if (!el.dataset.bound) { el.addEventListener('click', onClick); el.dataset.bound = '1'; }
      actionBar();
      document.body.classList.add('has-report');
      ['paneRoad', 'paneRail', 'paneHourly'].forEach(id => { const d = document.getElementById(id); if (d) d.open = false; });
      render();
      // Hourly reference profiles are static files on this site; load them so the summary is complete.
      setTimeout(() => { if (state?.report !== report) return; const b = document.querySelector('#tmasPanel button.action-button'); if (b && !b.disabled) { report.autoHourly = true; b.click(); } }, 400);
    },
    hornCrossing, nightHornCrossing, perDay,
    rail(report, meters) { if (state?.report === report) { state.rail = meters; render(); } },
    roads(report, rows) { if (state?.report === report) { state.roads = rows; render(); } },
    night(report, info) { if (state?.report === report && (state.night === undefined || info?.kind === 'all')) { state.night = info; render(); } },
    context(report) { if (state?.report === report) render(); },
    reset() { state = null; document.body.classList.remove('has-report'); }
  };
})();
