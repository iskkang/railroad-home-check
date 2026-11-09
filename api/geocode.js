export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON request body.' });
    }
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Expected a JSON object.' });

  try {
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    if (!address || address.length < 6 || address.length > 250) {
      return res.status(400).json({ error: 'Enter a complete U.S. street address.' });
    }

    // Census first (two tries); Photon/OpenStreetMap as a backup when Census is unreachable.
    let censusError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await census(address);
        if (result === null) {
          const backup = await photon(address);
          if (backup) return res.status(200).json(backup);
          return res.status(404).json({ error: 'We could not match that address. Try a full street address with city, state, and ZIP code, or choose a point on the map.' });
        }
        return res.status(200).json(result);
      } catch (error) {
        censusError = error;
        if (attempt === 0) await new Promise(r => setTimeout(r, 400));
      }
    }
    console.error('census geocode failed, trying Photon', censusError);
    const backup = await photon(address);
    if (backup) return res.status(200).json(backup);
    throw censusError;
  } catch (error) {
    console.error('geocode error', error);
    return res.status(502).json({ error: 'Address lookup is temporarily unavailable. Please try again.' });
  }
}

async function census(address) {
  const params = new URLSearchParams({ address, benchmark: 'Public_AR_Current', format: 'json' });
  const response = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`, {
    headers: { 'User-Agent': 'RailroadHomeCheck/0.1' }, signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`Census geocoder returned ${response.status}`);
  const data = await response.json();
  const match = data?.result?.addressMatches?.[0];
  if (!match?.coordinates) return null;
  return { lat: Number(match.coordinates.y), lon: Number(match.coordinates.x), matchedAddress: match.matchedAddress || address };
}

// Backup only: accept a U.S. house-level match so a street or city centroid is never treated as the home.
async function photon(address) {
  try {
    const params = new URLSearchParams({ q: address, limit: '3', lang: 'en' });
    const response = await fetch(`https://photon.komoot.io/api/?${params}`, {
      headers: { 'User-Agent': 'RailroadHomeCheck/0.1 (railroad-home-check.vercel.app)' }, signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) return null;
    const data = await response.json();
    const f = (data.features || []).find(x => x?.properties?.countrycode === 'US' && x.properties.housenumber && x.geometry?.coordinates);
    if (!f) return null;
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    const matched = [[p.housenumber, p.street].filter(Boolean).join(' '), p.city || p.town || p.village, [p.state, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ').toUpperCase();
    return { lat: Number(lat), lon: Number(lon), matchedAddress: matched || address, source: 'photon' };
  } catch {
    return null;
  }
}
