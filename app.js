const form = document.getElementById('searchForm');
const addressInput = document.getElementById('address');
const button = document.getElementById('searchButton');
const statusBox = document.getElementById('status');
const results = document.getElementById('results');
let currentReport = null;
let propertyMap = null;
const shortlist = [];

const $ = (id) => document.getElementById(id);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const address = addressInput.value.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!address) return;

  trackEvent('property_check_started');
  setLoading(true, 'Locating the property…');
  results.classList.add('hidden');
  currentReport = null;

  try {
    const geo = await fetchJSON('/api/geocode', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ address })
    });
    setStatus('Checking nearby FRA grade-crossing records…');
    const report = await fetchJSON(`/api/crossings?lat=${geo.lat}&lon=${geo.lon}`);
    renderReport({ ...report, lat: geo.lat, lon: geo.lon, matchedAddress: geo.matchedAddress || address });
    trackEvent('property_check_completed');
    statusBox.classList.add('hidden');
    results.classList.remove('hidden');
    $('loadMap').click();
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    trackEvent('property_check_failed');
    console.error(error);
    setError(error.message || 'We could not complete this check. Please try another full U.S. street address.');
  } finally {
    setLoading(false);
  }
});

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function trackEvent(eventName) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName);
  }
}

function setLoading(isLoading, message) {
  button.disabled = isLoading;
  button.textContent = isLoading ? 'Checking…' : 'Check this address';
  if (isLoading) setStatus(message || 'Checking…');
}

function setStatus(message) {
  statusBox.textContent = message;
  statusBox.className = 'status';
}

function setError(message) {
  statusBox.textContent = message;
  statusBox.className = 'status error';
}

function renderReport(report) {
  const nearest = report.crossings?.[0];
  currentReport = report;
  showTmasPatterns(report);
  showRoadTraffic(report);
  showRailDistance(report);
  resetMap();
  organizeReport(report);
  $('actionStatus').textContent = '';
  $('shareLink').classList.add('hidden');
  $('reportData').classList.toggle('hidden', !nearest);
  $('emptyReport').classList.toggle('hidden', !!nearest);
  $('resultAddress').textContent = report.matchedAddress;
  if (!nearest) {
    $('attentionBadge').textContent = 'NO CROSSINGS RETURNED';
    return;
  }

  $('resultAddress').textContent = report.matchedAddress;
  $('distanceValue').textContent = nearest.distanceMiles < 0.1 ? `${Math.round(nearest.distanceMiles * 5280)} ft` : `${nearest.distanceMiles.toFixed(2)} mi`;
  $('crossingStreet').textContent = nearest.street || nearest.city || 'Nearest FRA crossing';
  $('dayValue').textContent = displayCount(nearest.dayTrains, nearest.lessThanOne, nearest.weeklyTrains);
  $('nightValue').textContent = displayCount(nearest.nightTrains, nearest.lessThanOne, nearest.weeklyTrains);
  $('quietValue').textContent = nearest.quietZone.label;
  $('quietNote').textContent = nearest.quietZone.note;
  $('crossingId').textContent = nearest.crossingId || 'Not reported';
  $('railroadName').textContent = nearest.railroadName || nearest.railroadCode || 'Not reported';
  $('countYear').textContent = nearest.trainCountYear || 'Not reported';
  $('speedRange').textContent = speedRange(nearest);
  $('maxSpeed').textContent = numberOrDash(nearest.maxTimetableSpeed, ' mph');
  $('incidentCount').textContent = nearest.incidentCount == null ? 'Unavailable' : `${nearest.incidentCount} in recent 6-year data`;

  const assessment = assess(nearest);
  const badge = $('attentionBadge');
  badge.className = 'attention-badge';
  badge.textContent = assessment.badge;
  $('takeawayTitle').textContent = assessment.title;
  $('takeawayText').textContent = assessment.text;

  const list = $('crossingList');
  list.innerHTML = '';
  report.crossings.slice(0, 7).forEach((crossing) => {
    const row = document.createElement('div');
    row.className = 'crossing-row';
    row.innerHTML = `
      <span class="distance">${crossing.distanceMiles.toFixed(2)} mi</span>
      <div><strong>${escapeHTML(crossing.street || crossing.city || 'Rail crossing')}</strong><br><span>${escapeHTML(crossing.railroadName || crossing.railroadCode || 'Railroad not reported')}</span></div>
      <span>${displayCount(crossing.dayTrains, crossing.lessThanOne, crossing.weeklyTrains)} day / ${displayCount(crossing.nightTrains, crossing.lessThanOne, crossing.weeklyTrains)} night</span>
      <span>${speedRange(crossing)}</span>
      <span class="qz-pill">${escapeHTML(crossing.quietZone.label)}</span>
    `;
    list.appendChild(row);
  });
}

function displayCount(value, lessThanOne, weekly) {
  if (value !== null && value !== undefined && value !== '') return String(value);
  if (lessThanOne) return '<1/day';
  if (weekly) return `${weekly}/wk`;
  return '—';
}

function speedRange(c) {
  if (c.typicalMinSpeed != null && c.typicalMaxSpeed != null) return `${c.typicalMinSpeed}–${c.typicalMaxSpeed} mph`;
  if (c.typicalMaxSpeed != null) return `Up to ${c.typicalMaxSpeed} mph`;
  if (c.typicalMinSpeed != null) return `${c.typicalMinSpeed}+ mph`;
  return 'Not reported';
}

function numberOrDash(value, suffix='') {
  return value === null || value === undefined || value === '' ? 'Not reported' : `${value}${suffix}`;
}

function assess(c) {
  const count = value => value === null || value === undefined || String(value).trim() === ''
    ? null : (Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null);
  const night = count(c.nightTrains);
  const day = count(c.dayTrains);
  const nightText = night === null
    ? 'Nighttime thru-train movements were not reported.'
    : `FRA reports an estimated ${night} nighttime thru-train movements (6 PM–6 AM) at this crossing.`;
  const dayText = day === null
    ? 'Daytime thru-train movements were not reported.'
    : `The daytime estimate is ${day} movements (6 AM–6 PM).`;
  const yearText = c.trainCountYear
    ? `Reported train-count year: ${c.trainCountYear}. These are historical estimates, not live schedules.`
    : 'The train-count year is not reported; these estimates are not live schedules.';
  const quietText = {
    '1': 'A 24-hour quiet zone is reported: routine horn sounding is restricted, but exceptions apply. Train noise and vibration may still occur.',
    '2': 'A partial quiet zone is reported: horn restrictions apply only at designated times. Train noise and vibration may still occur.',
    '3': 'Chicago-excused status is reported. Verify applicable horn rules and local conditions.',
    '0': 'No quiet-zone designation is reported. Horns may be sounded.'
  }[c.quietZone?.code] || 'Quiet-zone status is not reported; horn restrictions cannot be determined from this record.';

  return {
    badge: 'ON-SITE CHECK RECOMMENDED',
    title: night === null
      ? `Nearest crossing: ${c.distanceMiles.toFixed(2)} mi · Night traffic not reported`
      : `Nearest crossing: ${c.distanceMiles.toFixed(2)} mi · ${night} nighttime movements reported`,
    text: `${nightText} ${dayText} ${yearText} ${quietText} Distance is to the nearest reported crossing, not the nearest rail line; tracks may be closer. This report does not rate noise or safety. Visit during the evening and late night to assess actual conditions.`
  };
}

function escapeHTML(value='') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
}


$('tryExample').addEventListener('click', () => {
  if (button.disabled) return;
  addressInput.value = '200 N Main St, Santa Ana, CA 92701';
  trackEvent('example_check_started');
  form.requestSubmit();
});

$('printReport').addEventListener('click', () => { if (currentReport) window.print(); });
$('compareAnother').addEventListener('click', () => {
  addressInput.value = '';
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  addressInput.focus({ preventScroll: true });
});
$('clearComparison').addEventListener('click', () => { shortlist.length = 0; renderComparison(); });
$('addCompare').addEventListener('click', () => {
  if (!currentReport) return;
  if (shortlist.some(r => r.matchedAddress === currentReport.matchedAddress)) {
    $('actionStatus').textContent = 'This address is already in your comparison.';
    return;
  }
  if (shortlist.length >= 3) {
    $('actionStatus').textContent = 'Your comparison has three homes. Remove one below to add another.';
    $('comparison').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  shortlist.push(currentReport);
  renderComparison();
  trackEvent('property_added_to_comparison');
  $('actionStatus').textContent = 'Added to comparison. Check another address to build your shortlist.';
  $('comparison').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
function renderComparison() {
  $('comparison').classList.toggle('hidden', shortlist.length === 0);
  const table = document.createElement('table');
  const header = document.createElement('tr');
  const label = document.createElement('th'); label.textContent = 'Nearest crossing facts'; label.scope = 'col'; header.append(label);
  shortlist.forEach((report, i) => {
    const cell = document.createElement('th'); cell.scope = 'col';
    const name = document.createElement('p'); name.textContent = report.matchedAddress; cell.append(name);
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${report.matchedAddress}`);
    remove.addEventListener('click', () => { shortlist.splice(i, 1); renderComparison(); }); cell.append(remove); header.append(cell);
  });
  const head = document.createElement('thead'); head.append(header); table.append(head);
  const body = document.createElement('tbody');
  const fields = [
    ['Crossing distance (not tracks)', c => `${c.distanceMiles.toFixed(2)} mi`],
    ['Night movements · 6 PM–6 AM', c => numberOrDash(c.nightTrains)],
    ['Day movements · 6 AM–6 PM', c => numberOrDash(c.dayTrains)],
    ['Train-count year', c => c.trainCountYear || 'Not reported'],
    ['Quiet-zone status', c => c.quietZone?.label || 'Not reported'],
    ['Crossing street', c => c.street || 'Not reported'],
    ['Railroad', c => c.railroadName || c.railroadCode || 'Not reported']
  ];
  fields.forEach(([name, format]) => {
    const row = document.createElement('tr'); const th = document.createElement('th'); th.scope = 'row'; th.textContent = name; row.append(th);
    shortlist.forEach(report => { const td = document.createElement('td'); td.textContent = report.crossings?.[0] ? format(report.crossings[0]) : 'No crossing returned'; row.append(td); });
    body.append(row);
  });
  table.append(body); $('comparisonTable').replaceChildren(table);
}
$('shareReport').addEventListener('click', async () => {
  if (!currentReport) return;
  const url = new URL(location.pathname, location.origin);
  url.hash = new URLSearchParams({ address: currentReport.matchedAddress }).toString();
  try {
    await navigator.clipboard.writeText(url.href);
    $('actionStatus').textContent = 'Link copied. It includes this property address.';
    trackEvent('report_link_copied');
  } catch {
    $('shareLink').value = url.href;
    $('shareLink').classList.remove('hidden'); $('shareLink').select();
    $('actionStatus').textContent = 'Copy the link below. It includes this property address.';
  }
});
function resetMap() {
  if (propertyMap) { propertyMap.remove(); propertyMap = null; }
  $('propertyMap').classList.add('hidden');
  $('loadMap').classList.remove('hidden');
  $('mapNotice').textContent = 'Loading sends the viewed area and IP address to OpenStreetMap and the property coordinates to ArcGIS for road and rail data.';
}
$('loadMap').addEventListener('click', () => {
  if (!currentReport) return;
  if (!window.L) { $('mapNotice').textContent = 'The map could not load. The crossing list and report are still available. Refresh to retry.'; return; }
  $('propertyMap').classList.remove('hidden'); $('loadMap').classList.add('hidden');
  const home = [currentReport.lat, currentReport.lon];
  propertyMap = L.map('propertyMap', { scrollWheelZoom: false }).setView(home, 14);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(propertyMap);
  tiles.on('tileerror', () => { $('mapNotice').textContent = 'Some map tiles are unavailable. Pins and the crossing list remain available; refresh to retry.'; });
  const marker = (point, title, content, className, text) => {
    const popup = document.createElement('div'); popup.textContent = content;
    return L.marker(point, { title, icon: L.divIcon({ className, html: text, iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(propertyMap).bindPopup(popup);
  };
  marker(home, 'Property (approximate location)', currentReport.matchedAddress + ' — approximate geocoded location', 'home-pin', 'H');
  const points = [home];
  currentReport.crossings.forEach((c, i) => {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) return;
    const point = [c.lat, c.lon]; points.push(point);
    marker(point, `Crossing ${i + 1}: ${c.street || c.crossingId}`, `${c.street || c.crossingId} · ${c.distanceMiles.toFixed(2)} mi from property · Night movements: ${numberOrDash(c.nightTrains)} · Count year: ${c.trainCountYear || 'Not reported'}`, i === 0 ? 'crossing-pin nearest-pin' : 'crossing-pin', String(i + 1));
  });
  if (points.length > 1) propertyMap.fitBounds(points, { padding: [35, 35], maxZoom: 15 });
  L.control.scale({ imperial: true, metric: false }).addTo(propertyMap);
  trackEvent('property_map_opened');
});
if (window.sharedPropertyAddress && window.sharedPropertyAddress.length <= 250) {
  addressInput.value = window.sharedPropertyAddress;
  setStatus('Shared address loaded. Select “Check this address” to retrieve the current report.');
}
window.sharedPropertyAddress = '';

window.addEventListener('hashchange', () => {
  const shared = new URLSearchParams(location.hash.slice(1)).get('address');
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  if (shared && shared.length <= 250 && !button.disabled) {
    addressInput.value = shared;
    setStatus('Shared address loaded. Select “Check this address” to retrieve the current report.');
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

function showRailDistance(report) {
  let panel = $('railDistancePanel');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'railDistancePanel'; panel.className = 'panel map-panel';
    $('reportData').before(panel);
  }
  panel.innerHTML = '<div class="panel-kicker">DISTANCE TO TRACKS</div><h3>How close is the nearest mapped rail line?</h3><p class="small-note">Estimate from the approximate property pin to a mapped rail centerline within 3.25 miles. Includes mapped lines regardless of operating status; not a survey or noise rating. Source: USDOT / BTS North American Rail Network. Loading sends the searched coordinates and your IP address to the ArcGIS data service.</p><button type="button" class="action-button">Check rail-line distance</button><p role="status" class="small-note"></p>';
  const btn = panel.querySelector('button'), status = panel.querySelector('[role="status"]');
  btn.addEventListener('click', async () => {
    btn.disabled = true; status.textContent = 'Checking mapped rail lines…';
    try {
      const params = new URLSearchParams({f:'json', geometry:report.lon+','+report.lat,geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',distance:'5230.368',units:'esriSRUnit_Meter',outFields:'OBJECTID',returnGeometry:'true',outSR:'4326',resultRecordCount:'1000'});
      const response = await fetch('https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_North_American_Rail_Network_Lines/FeatureServer/0/query?'+params, {signal:AbortSignal.timeout(20000)});
      if (!response.ok) throw Error('Rail data request failed');
      const data = await response.json();
      if (data.error || !Array.isArray(data.features) || data.exceededTransferLimit) throw Error('Incomplete rail data');
      const paths = data.features.flatMap(f => f.geometry?.paths || []);
      const meters = nearestRailMeters(report.lat, report.lon, paths);
      if (currentReport !== report) return;
      updateRailOverview(report, meters);
      status.textContent = Number.isFinite(meters) && meters <= 5230.368
        ? 'Nearest mapped rail line: approximately '+(meters < 160.9344 ? Math.round(meters/0.3048)+' ft' : (meters/1609.344).toFixed(2)+' mi')+'. This is rail-line distance, separate from crossing distance. Operating status and train counts on this line have not been verified.'
        : 'No mapped rail line found within 3.25 miles. Missing data is possible; this does not establish that no tracks exist.';
      if (paths.length) {
        if (!propertyMap) $('loadMap').click();
        if (propertyMap) {
          L.polyline(paths.map(path=>path.map(([lon,lat])=>[lat,lon])),{color:'#626b73',weight:3,opacity:0.85,dashArray:'6 5'}).addTo(propertyMap).bindTooltip('Mapped rail centerline · USDOT/BTS · operating status unverified');
          status.textContent += ' Gray dashed lines on the map show the mapped rail network.';
        }
      }
      btn.textContent = 'Rail-line check complete';
    } catch {
      if (currentReport !== report) return;
      $('overviewRail').textContent = 'Unavailable'; $('overviewRailNote').textContent = 'Retry in Rail & crossings';
      status.textContent = 'Rail-line distance is unavailable. Your crossing report is still available. Try again.';
      btn.disabled = false;
    }
  });
}
function nearestRailMeters(lat, lon, paths) {
  const scale = Math.cos(lat*Math.PI/180), radians = Math.PI/180, radius = 6371008.8;
  let best = Infinity;
  for (const path of paths) for (let i=1;i<path.length;i++) {
    const [x1,y1]=path[i-1], [x2,y2]=path[i];
    if (![x1,y1,x2,y2].every(Number.isFinite)) continue;
    const ax=(x1-lon)*radians*radius*scale, ay=(y1-lat)*radians*radius;
    const bx=(x2-lon)*radians*radius*scale, by=(y2-lat)*radians*radius;
    const dx=bx-ax, dy=by-ay, length=dx*dx+dy*dy;
    const t=length ? Math.max(0,Math.min(1,-(ax*dx+ay*dy)/length)) : 0;
    best=Math.min(best,Math.hypot(ax+t*dx,ay+t*dy));
  }
  return best;
}

const ROAD_TRAFFIC_SERVICE = 'https://services.arcgis.com/xOi1kZaI0eWDREZv/ArcGIS/rest/services/HPMS_National_Current/FeatureServer/0';
function showRoadTraffic(report) {
  let panel = $('roadTrafficPanel');
  if (!panel) {
    panel = document.createElement('section'); panel.id = 'roadTrafficPanel'; panel.className = 'panel map-panel';
    $('reportData').before(panel);
  }
  panel.innerHTML = '<div class="panel-kicker">ROAD TRAFFIC NEAR THIS ADDRESS</div><h3>How busy are the nearby roads?</h3><p class="small-note">Road segments within 1 mile of the approximate property pin. AADT is annual average daily vehicle traffic, not live congestion, nighttime traffic, or a noise measurement. Coverage varies; smaller streets may have no reported counts. Counts on adjacent segments must not be added together.</p><button type="button" class="action-button">Check nearby road traffic</button><p class="small-note">Source: <a href="'+ROAD_TRAFFIC_SERVICE+'" target="_blank" rel="noreferrer">USDOT / BTS · FHWA HPMS</a>. Loading sends the searched coordinates and your IP address to the ArcGIS data service.</p><p role="status" class="small-note"></p><div class="table-scroll"></div>';
  const button = panel.querySelector('button'), status = panel.querySelector('[role="status"]'), container = panel.querySelector('.table-scroll');
  button.addEventListener('click', async () => {
    button.disabled = true; status.textContent = 'Loading reported road traffic…';
    try {
      const params = new URLSearchParams({f:'json',geometry:report.lon+','+report.lat,geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',distance:'1609.344',units:'esriSRUnit_Meter',outFields:'DATA_YEAR,ROUTE_ID,RouteName,RouteNumber,AADT,AADT_SINGLE_UNIT,AADT_COMBINATION',returnGeometry:'true',outSR:'4326',resultRecordCount:'1000'});
      const response = await fetch(ROAD_TRAFFIC_SERVICE+'/query?'+params,{signal:AbortSignal.timeout(25000)});
      if (!response.ok) throw Error('Traffic service unavailable');
      const data = await response.json();
      if (data.error || !Array.isArray(data.features) || data.exceededTransferLimit) throw Error('Incomplete traffic data');
      if (currentReport !== report) return;
      const rows = trafficRows(data.features,report.lat,report.lon);
      updateRoadOverview(report, rows);
      if (!rows.length) {
        if (propertyMap) drawTrafficVolumes(report, [], data.features);
        status.textContent = 'No road segments with reported traffic counts were returned within 1 mile. This is a data gap, not evidence of low traffic.';
        button.textContent = 'Traffic check complete'; return;
      }
      const shown = rows.slice(0,15);
      status.textContent = 'Showing '+shown.length+' of '+rows.length+' road segments with reported counts, nearest first. Distances are to mapped road centerlines. Rows may describe different sections of the same road; vehicle counts can overlap.';
      const table = document.createElement('table');
      const head = document.createElement('thead'), header = document.createElement('tr');
      ['Road segment','Distance','Vehicles / day (AADT)','Single-unit trucks & buses / day','Combination trucks / day','Data year'].forEach(label=>{const th=document.createElement('th');th.scope='col';th.textContent=label;header.append(th)});
      head.append(header);table.append(head);const body=document.createElement('tbody');
      const fmt = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) || Number(v)<0 ? 'Not reported' : Number(v).toLocaleString('en-US');
      shown.forEach((row,i)=>{
        const tr=document.createElement('tr');
        [String(i+1)+'. '+row.name,row.meters<160.9344?Math.round(row.meters/0.3048)+' ft':(row.meters/1609.344).toFixed(2)+' mi',fmt(row.a.AADT),fmt(row.a.AADT_SINGLE_UNIT),fmt(row.a.AADT_COMBINATION),row.a.DATA_YEAR || 'Not reported'].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td)});
        body.append(tr);
      });table.append(body);container.replaceChildren(table);
      if (!propertyMap) $('loadMap').click();
      if (propertyMap) {
        drawTrafficVolumes(report, rows, data.features);
        status.textContent += ' The map colors all '+rows.length+' returned counted road groups by fixed daily-volume bands; the table lists the nearest '+shown.length+'. Gray overlays have no reported count. Uncolored streets may have no coverage.';
      }
      button.textContent = 'Traffic check complete'; trackEvent('road_traffic_checked');
    } catch {
      if(currentReport!==report)return;
      $('overviewRoad').textContent='Unavailable'; $('overviewRoadNote').textContent='Retry in Road traffic';
      status.textContent='Road traffic data is unavailable. Try again; your railroad report is still available.';button.disabled=false;
    }
  });
}
function trafficRows(features,lat,lon) {
  const segments = features.map(feature=>{
    const a=feature.attributes || {},paths=feature.geometry?.paths || [];
    return {a,paths,name:a.RouteName || (a.RouteNumber?'Route '+a.RouteNumber:null) || a.ROUTE_ID || 'Unnamed road segment',meters:nearestRailMeters(lat,lon,paths)};
  }).filter(row=>row.a.AADT!==null && row.a.AADT!==undefined && row.a.AADT!=='' && Number.isFinite(Number(row.a.AADT)) && Number(row.a.AADT)>=0 && row.meters<=1609.344).sort((a,b)=>a.meters-b.meters);
  const groups = new Map();
  for (const row of segments) {
    const key = JSON.stringify([row.name,row.a.AADT,row.a.DATA_YEAR,row.a.AADT_SINGLE_UNIT,row.a.AADT_COMBINATION]);
    if (groups.has(key)) groups.get(key).paths.push(...row.paths);
    else groups.set(key,{...row,paths:[...row.paths]});
  }
  return [...groups.values()];
}

let tmasIndexPromise;
const tmasStateCache = new Map();
function tmasDistance(lat1,lon1,lat2,lon2) {
  const rad=Math.PI/180, a=Math.sin((lat2-lat1)*rad/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lon2-lon1)*rad/2)**2;
  return 3958.7613*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function showTmasPatterns(report) {
  let panel=$('tmasPanel');
  if(!panel){panel=document.createElement('section');panel.id='tmasPanel';panel.className='panel map-panel';$('reportData').before(panel);}
  panel.innerHTML='<div class="panel-kicker">NIGHTTIME ROAD TRAFFIC · HISTORICAL SAMPLE</div><h3>What happens on nearby roads after dark?</h3><p class="small-note">December 2023 station observations, not current traffic or an annual average. Holiday and seasonal patterns may differ. Each profile covers one reported direction/lane stream only, not necessarily the whole road. Nearby stations are reference locations; we have not verified that they are on the same road as this property.</p><button type="button" class="action-button">Explore nearby hourly traffic</button><p role="status" class="small-note"></p><div class="tmas-content"></div><p class="small-note">Source: <a href="https://www.fhwa.dot.gov/policyinformation/tables/tmasdata/" target="_blank" rel="noreferrer">FHWA TMAS hourly volume and station records</a>; station coordinates: USDOT/BTS. At least 14 complete observed days per profile. Missing hours/days are not treated as zero. This sample does not establish noise levels or nighttime truck counts.</p>';
  const button=panel.querySelector('button'),status=panel.querySelector('[role="status"]'),content=panel.querySelector('.tmas-content');
  button.addEventListener('click',async()=>{
    button.disabled=true;status.textContent='Finding nearby stations with usable hourly observations…';
    try {
      if(!tmasIndexPromise)tmasIndexPromise=fetchJSON('/data/tmas/index.json').catch(e=>{tmasIndexPromise=null;throw e;});
      const index=await tmasIndexPromise;
      const nearby=index.stations.map(s=>({state:s[0],id:s[1],lat:s[2],lon:s[3],miles:tmasDistance(report.lat,report.lon,s[2],s[3])})).filter(s=>s.miles<=10).sort((a,b)=>a.miles-b.miles).slice(0,3);
      if(currentReport!==report)return;
      if(!nearby.length){status.textContent='No matched station with at least 14 complete December 2023 days was found within 10 miles. This is missing coverage, not evidence of quiet roads.';button.textContent='Station search complete';return;}
      const states=[...new Set(nearby.map(s=>s.state))];
      await Promise.all(states.map(async state=>{if(!tmasStateCache.has(state))tmasStateCache.set(state,await fetchJSON('/data/tmas/'+state+'.json'));}));
      if(currentReport!==report)return;
      const stations=nearby.map(n=>({...tmasStateCache.get(n.state).stations.find(s=>s.id===n.id),miles:n.miles})).filter(s=>s.profiles);
      if(!stations.length)throw Error('Station profile unavailable');
      status.textContent='Nearest available stations within 10 miles. Select a station and verify its road/location before applying its pattern to a home.';
      const label=document.createElement('label');label.textContent='Reference station ';const select=document.createElement('select');select.style.cssText='max-width:100%;padding:10px;margin:10px 0';
      stations.forEach((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=s.state+' '+s.id+' · '+s.miles.toFixed(2)+' mi · '+(s.location||'Location description unavailable');select.append(o)});label.append(select);
      const groupLabel=document.createElement('label');groupLabel.textContent=' Observation days ';const group=document.createElement('select');group.style.cssText='padding:10px;margin:10px';
      for(const [value,text] of [['all','All observed days'],['weekday','Weekdays'],['weekend','Weekends']]){const o=document.createElement('option');o.value=value;o.textContent=text;group.append(o)}groupLabel.append(group);
      const body=document.createElement('div');content.replaceChildren(label,groupLabel,body);
      const render=()=>renderTmasProfile(stations[Number(select.value)],group.value,body,report);
      select.addEventListener('change',render);group.addEventListener('change',render);render();button.textContent='Station profiles loaded';trackEvent('hourly_traffic_explored');
    }catch{if(currentReport!==report)return;status.textContent='Hourly station data is unavailable. Try again; the HPMS road traffic report remains available.';button.disabled=false;}
  });
}
function renderTmasProfile(station,kind,body,report) {
  const p=station.profiles[kind];body.replaceChildren();
  const text=document.createElement('p');text.className='small-note';
  text.textContent=(station.location||'Station '+station.id)+' · '+station.state+' '+station.id+' · '+station.miles.toFixed(2)+' miles from property. Reported direction code '+station.direction+', lane code '+station.lane+'. Observations: '+station.start+' to '+station.end+'. '+p.days+' complete '+kind+' days. The selected stream is not a verified count for all directions or lanes. Hours follow the source record; timezone and daylight-saving conventions have not been independently verified.';body.append(text);
  if(!p.days||!p.hours){const empty=document.createElement('p');empty.textContent='No complete days in this selection.';body.append(empty);return;}
  const night=[22,23,0,1,2,3,4,5].reduce((n,h)=>n+p.hours[h],0),total=p.hours.reduce((a,b)=>a+b,0);
  const summary=document.createElement('p');summary.textContent='Average recorded volume during 10 PM–6 AM hours: '+Math.round(night).toLocaleString('en-US')+' vehicles per observed day ('+(total?(night/total*100).toFixed(1):'0.0')+'% of the recorded daily volume). These eight hours are summed within each calendar-day record, not matched across consecutive nights.';body.append(summary);
  const chart=document.createElement('div');chart.setAttribute('role','img');chart.setAttribute('aria-label','24-hour average vehicle counts. Exact values are in the expandable table below.');chart.style.cssText='display:flex;align-items:flex-end;gap:3px;height:190px;padding:15px 4px 24px;border-bottom:1px solid #ccd0c9;margin:18px 0 30px';
  const max=Math.max(...p.hours,1);
  p.hours.forEach((value,h)=>{const bar=document.createElement('div');bar.style.cssText='position:relative;flex:1;min-width:0;background:'+(h>=22||h<6?'#233e55':'#be5a35')+';height:'+Math.max(1,value/max*100)+'%';bar.title=String(h).padStart(2,'0')+':00 — '+Math.round(value).toLocaleString('en-US')+' vehicles/hour';if([0,6,12,18,23].includes(h)){const tick=document.createElement('span');tick.style.cssText='position:absolute;bottom:-22px;left:0;font-size:10px';tick.textContent=String(h).padStart(2,'0');bar.append(tick)}chart.append(bar)});body.append(chart);
  const legend=document.createElement('p');legend.className='small-note';legend.textContent='Dark bars: 10 PM–6 AM hours. Orange bars: other hours. Height: mean vehicles/hour over complete observation days.';body.append(legend);
  const details=document.createElement('details'),title=document.createElement('summary');title.textContent='View exact hourly counts';details.append(title);const table=document.createElement('table');const thead=document.createElement('thead');thead.innerHTML='<tr><th scope="col">Hour starting</th><th scope="col">Mean vehicles / hour</th></tr>';table.append(thead);const tbody=document.createElement('tbody');p.hours.forEach((v,h)=>{const tr=document.createElement('tr');const td=document.createElement('td');td.textContent=String(h).padStart(2,'0')+':00';const count=document.createElement('td');count.textContent=v.toLocaleString('en-US');tr.append(td,count);tbody.append(tr)});table.append(tbody);const tableWrap=document.createElement('div');tableWrap.className='table-scroll';tableWrap.append(table);details.append(tableWrap);body.append(details);
  const locate=document.createElement('button');locate.type='button';locate.className='action-button secondary';locate.textContent='Show this reference station on map';locate.addEventListener('click',()=>{if(currentReport!==report)return;if(!propertyMap)$('loadMap').click();if(!propertyMap)return;if(report.tmasMarker)propertyMap.removeLayer(report.tmasMarker);const popup=document.createElement('div');popup.textContent=station.state+' '+station.id+' · '+(station.location||'TMAS station')+' · Reference station; same-road connection unverified.';report.tmasMarker=L.circleMarker([station.lat,station.lon],{radius:9,color:'#233e55',fillOpacity:0.9}).addTo(propertyMap).bindPopup(popup).openPopup();propertyMap.fitBounds([[report.lat,report.lon],[station.lat,station.lon]],{padding:[30,30]});$('propertyMap').scrollIntoView({behavior:'smooth',block:'center'});});body.append(locate);
}

function organizeReport(report) {
  const nearest = report.crossings?.[0];
  $('overviewRail').textContent='Loading…';$('overviewRailNote').textContent='Looking up mapped rail lines';
  $('overviewRoad').textContent='Loading…';$('overviewRoad').closest('.overview-card').style.borderTopColor='#9ca3af';$('overviewRoadNote').textContent='Annual average vehicles / day';
  $('overviewNight').textContent=nearest ? displayCount(nearest.nightTrains,nearest.lessThanOne,nearest.weeklyTrains) : 'Not available';
  $('overviewNightNote').textContent=nearest ? '6 PM–6 AM · Count year: '+(nearest.trainCountYear || 'not reported') : 'No crossing returned within 3.25 mi';
  const targets=[['roadTrafficPanel','paneRoad','Annual average traffic on reported road segments within 1 mile. Not live congestion.'],['railDistancePanel','paneRail','Approximate distance to mapped rail centerlines within 3.25 miles.'],['tmasPanel','paneHourly','December 2023 reference station observations. Same-road connection is not verified.']];
  targets.forEach(([id,target,description])=>{
    const panel=$(id);$(target).prepend(panel);
    const source=document.createElement('details');source.className='data-disclosure';
    const summary=document.createElement('summary');summary.textContent='Source, coverage & limitations';source.append(summary);
    panel.querySelectorAll('p.small-note:not([role="status"])').forEach(p=>source.append(p));
    const intro=document.createElement('p');intro.className='small-note';intro.textContent=description;
    panel.querySelector('h3').after(intro);panel.append(source);
  });
  selectReportTab('Road');
}
function selectReportTab(name) {
  ['Road','Rail','Hourly'].forEach(n=>{const active=n===name;const tab=$('tab'+n);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$('pane'+n).classList.toggle('hidden',!active);});
  if(propertyMap)propertyMap.invalidateSize();
}
['Road','Rail','Hourly'].forEach((name,i)=>{
  const tab=$('tab'+name);tab.addEventListener('click',()=>selectReportTab(name));
  tab.addEventListener('keydown',e=>{const keys=['ArrowRight','ArrowLeft','Home','End'];if(!keys.includes(e.key))return;e.preventDefault();const names=['Road','Rail','Hourly'];const next=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;selectReportTab(names[next]);$('tab'+names[next]).focus();});
});
$('loadMap').addEventListener('click',()=>{
  if(!currentReport)return;
  [['roadTrafficPanel','overviewRoad'],['railDistancePanel','overviewRail']].forEach(([id,overview])=>{const btn=$(id)?.querySelector('button');if(btn&&!btn.disabled){$(overview).textContent='Loading…';btn.click();}});
});
function updateRailOverview(report,meters) {
  if(currentReport!==report)return;
  $('overviewRail').textContent=Number.isFinite(meters)&&meters<=5230.368 ? (meters<160.9344?Math.round(meters/0.3048)+' ft':(meters/1609.344).toFixed(2)+' mi') : 'None returned';
  $('overviewRailNote').textContent='Mapped centerline · Approximate distance';
}
function updateRoadOverview(report,rows) {
  if(currentReport!==report)return;
  const nearest=rows[0];
  $('overviewRoad').closest('.overview-card').style.borderTopColor=trafficVolumeBand(nearest?.a.AADT).color;
  $('overviewRoad').textContent=nearest ? Number(nearest.a.AADT).toLocaleString('en-US') : 'Not reported';
  $('overviewRoadNote').textContent=nearest ? 'vehicles/day · '+(nearest.a.DATA_YEAR||'Year unknown')+' · '+nearest.name : 'No counts returned within 1 mi';
}

function trafficVolumeBand(value) {
  if(value===null || value===undefined || String(value).trim()==='' || !Number.isFinite(Number(value)) || Number(value)<0)return {color:'#9ca3af',label:'Not reported'};
  const n=Number(value);
  if(n<5000)return {color:'#2563eb',label:'Under 5,000'};
  if(n<15000)return {color:'#0d9488',label:'5,000–14,999'};
  if(n<30000)return {color:'#eab308',label:'15,000–29,999'};
  if(n<60000)return {color:'#ea580c',label:'30,000–59,999'};
  return {color:'#dc2626',label:'60,000+'};
}
function drawTrafficVolumes(report,rows,features) {
  if(currentReport!==report || !propertyMap)return;
  if(report.trafficLayer)propertyMap.removeLayer(report.trafficLayer);
  const group=L.layerGroup().addTo(propertyMap);report.trafficLayer=group;
  const draw=(paths,content,color,weight)=>{
    const popup=document.createElement('div');popup.textContent=content;
    L.polyline(paths.map(path=>path.map(([lon,lat])=>[lat,lon])),{color,weight,opacity:0.85}).addTo(group).bindPopup(popup);
  };
  features.forEach(feature=>{
    const a=feature.attributes||{},paths=feature.geometry?.paths||[];
    if(trafficVolumeBand(a.AADT).label!=='Not reported'||nearestRailMeters(report.lat,report.lon,paths)>1609.344)return;
    draw(paths,(a.RouteName||a.ROUTE_ID||'Road segment')+' · Traffic count not reported · Data year: '+(a.DATA_YEAR||'Not reported'),'#9ca3af',3);
  });
  rows.forEach(row=>{
    const band=trafficVolumeBand(row.a.AADT);
    draw(row.paths,row.name+' · '+Number(row.a.AADT).toLocaleString('en-US')+' vehicles/day (AADT) · '+band.label+' band · Data year: '+(row.a.DATA_YEAR||'Not reported'),band.color,5);
  });
}
