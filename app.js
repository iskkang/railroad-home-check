const form = document.getElementById('searchForm');
const addressInput = document.getElementById('address');
const button = document.getElementById('searchButton');
const statusBox = document.getElementById('status');
const results = document.getElementById('results');

const $ = (id) => document.getElementById(id);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const address = addressInput.value.trim();
  if (!address) return;

  trackEvent('property_check_started');
  setLoading(true, 'Locating the property…');
  results.classList.add('hidden');

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
    renderReport({ ...report, matchedAddress: geo.matchedAddress || address });
    trackEvent('property_check_completed');
    statusBox.classList.add('hidden');
    results.classList.remove('hidden');
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
  button.textContent = isLoading ? 'Checking…' : 'Check railroad impact';
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
  if (!nearest) throw new Error('No FRA crossing records were found within approximately 3 miles of this address.');

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
