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

  setLoading(true, 'Locating the property…');
  results.classList.add('hidden');

  try {
    const geo = await fetchJSON(`/api/geocode?address=${encodeURIComponent(address)}`);
    setStatus('Checking nearby FRA grade-crossing records…');
    const report = await fetchJSON(`/api/crossings?lat=${geo.lat}&lon=${geo.lon}`);
    renderReport({ ...report, matchedAddress: geo.matchedAddress || address });
    statusBox.classList.add('hidden');
    results.classList.remove('hidden');
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    console.error(error);
    setError(error.message || 'We could not complete this check. Please try another full U.S. street address.');
  } finally {
    setLoading(false);
  }
});

async function fetchJSON(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
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
  badge.className = `attention-badge ${assessment.level}`;
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
  const miles = c.distanceMiles;
  const night = Number(c.nightTrains || 0);
  const total = Number(c.dayTrains || 0) + night;
  const quiet = c.quietZone.code;
  const countYear = c.trainCountYear ? ` The reported train-count year is ${c.trainCountYear}.` : '';
  const noQuiet = quiet === '0' || quiet === null;

  if (miles <= 0.3 && night >= 4 && noQuiet) {
    return {
      level: 'high', badge: 'HIGH ATTENTION',
      title: 'Rail activity deserves an in-person night check.',
      text: `The nearest FRA crossing is ${miles.toFixed(2)} miles away and reports about ${night} nighttime thru-train movements during normal operating periods. No federal quiet-zone designation is reported for this crossing. This does not predict indoor noise, but it is enough to make an evening and late-night visit important before making an offer.${countYear}`
    };
  }
  if (miles <= 0.6 && (night >= 1 || total >= 5)) {
    return {
      level: 'moderate', badge: 'MODERATE ATTENTION',
      title: 'Close enough that rail activity should be part of your due diligence.',
      text: `The nearest FRA crossing is ${miles.toFixed(2)} miles away. FRA inventory data reports ${night || 'some'} nighttime thru-train movement${night === 1 ? '' : 's'} and ${total || 'reported'} total day/night movements. Actual sound and vibration vary significantly by terrain, structures, train operations, and whether horns are routinely used.${countYear}`
    };
  }
  return {
    level: 'lower', badge: 'LOWER ATTENTION',
    title: 'The nearest reported crossing is less likely to dominate the property decision.',
    text: `The nearest FRA crossing is ${miles.toFixed(2)} miles away and the inventory does not show a combination of very close distance and substantial nighttime thru traffic. That is not a guarantee of quiet: rail lines, switching activity, terrain, and unreported operational changes can still matter. Verify conditions on site.${countYear}`
  };
}

function escapeHTML(value='') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
}
