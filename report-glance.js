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
    const near = horns[0];
    const within1 = horns.filter(c => c.distanceMiles <= 1);
    const nightWithin1 = within1.filter(nightHornCrossing);
    const maxNight = nightWithin1.reduce((m, c) => Math.max(m, Number(c.nightTrains) || 0), 0);
    const d = near ? near.distanceMiles : Infinity;
    const level = Object.assign({}, d <= 0.25 ? { key: 'loud', badge: 'LOUD', tone: 'warn', v: 'Loud: inside the horn-sounding stretch' }
      : d <= 0.5 ? { key: 'likely', badge: 'LIKELY AUDIBLE', tone: 'warn', v: 'Likely audible' }
      : d <= 1 ? { key: 'possible', badge: 'POSSIBLE', tone: 'neutral', v: 'Possibly audible, mostly at night' }
      : { key: 'unlikely', badge: 'UNLIKELY', tone: 'ok', v: 'Unlikely from routine crossing horns' });
    // Busiest horn crossing within the same distance band decides frequency, so one quiet spur doesn't hide a busy line.
    const band = horns.filter(c => c.distanceMiles <= Math.max(d, 0.25) + 0.25);
    const freq = band.reduce((m, c) => Math.max(m, perDay(c)), 0);
    if (near && d <= 1 && freq < 1) Object.assign(level, { badge: 'RARE', tone: 'neutral', v: `${d <= 0.25 ? 'Loud' : 'Audible'} when a train passes, but under 1 train/day reported` });
    return { level, near, horns, within1, nightWithin1, maxNight, freq };
  }

  const ICON = {
    rail: '<path d="M4 21 9 3"/><path d="M20 21 15 3"/><path d="M6 15h12"/><path d="M7 10h10"/><path d="M8 6h8"/>',
    cross: '<path d="M5 5l14 14"/><path d="M19 5 5 19"/>',
    horn: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 6a8.5 8.5 0 0 1 0 12"/>',
    road: '<path d="M8 3 4 21"/><path d="m16 3 4 18"/><path d="M12 5v2"/><path d="M12 11v2"/><path d="M12 17v2"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
    site: '<path d="M3 21V9l6 4V9l6 4V5h6v16Z"/>'
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
    return `<li class="g-row"><span class="g-ico g-${tone}">${icon(ic)}</span><div class="g-body"><div class="g-top"><span class="g-k">${esc(k)}</span>${badge ? `<span class="g-badge g-${btone || tone}">${esc(badge)}</span>` : ''}</div><div class="g-v">${v}</div>${note ? `<div class="g-note">${note}</div>` : ''}${action || ''}</div></li>`;
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
      const nightTxt = h.nightWithin1.length ? ` · up to ${h.maxNight} night ${h.maxNight === 1 ? 'train' : 'trains'} at ${h.nightWithin1.length} horn ${h.nightWithin1.length === 1 ? 'crossing' : 'crossings'} within 1 mi` : h.within1.length ? ' · no night trains reported at horn crossings within 1 mi' : '';
      note = esc(where + nightTxt);
    }
    note += '<br><span class="g-why">Horns sound 15–20 s before each public crossing outside quiet zones, at 96–110 dB. Estimate, not a measurement.</span>';
    return row({ ic: 'horn', tone: h.level.tone, k: 'Train horns at this home', v: esc(h.level.v), note, badge: h.level.badge });
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
    return `<div class="g-near"><h3>What's within ¾ mile</h3><p class="g-sub">Nearest first, from the approximate property pin.</p><ol>${items.map(i => `<li class="g-n-${i.k}"><span class="g-d">${esc(fmtMi(i.d))}</span><span class="g-dot" aria-hidden="true"></span><div><strong>${esc(i.t)}</strong><span>${esc(i.s)}</span></div></li>`).join('')}</ol></div>`;
  }

  function render() {
    if (!state) return;
    const el = panel();
    el.innerHTML = `<div class="g-head"><h3>At a glance</h3><p class="g-sub">Each line is a different source, place and year — not a combined noise or safety score.</p></div><ul class="g-list">${railRow(state)}${crossingRows(state.report)}${roadRow(state)}${nightRow(state)}${siteRow(state)}</ul>${nearList(state)}<nav class="g-jump" aria-label="Jump to report section"><a href="#paneRail" data-glance="pane">Rail</a><a href="#paneRoad" data-glance="pane">Roads</a><a href="#paneHourly" data-glance="pane">At night</a><a href="#topicliving" data-glance="living">Nearby sites</a><a href="#propertyMap" data-glance="map">Map</a></nav>`;
  }

  function onClick(e) {
    const a = e.target.closest('[data-glance]');
    if (!a || !state) return;
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

  window.ReportGlance = {
    start(report) {
      state = { report, rail: undefined, roads: undefined, night: undefined };
      const el = panel();
      if (!el.dataset.bound) { el.addEventListener('click', onClick); el.dataset.bound = '1'; }
      actionBar();
      document.body.classList.add('has-report');
      if (MOBILE.matches) { const road = document.getElementById('paneRoad'); if (road) road.open = false; }
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
