export default async function handler(req, res) {
  try {
    const address = String(req.query.address || '').trim();
    if (!address || address.length < 6) return res.status(400).json({ error: 'Enter a complete U.S. street address.' });

    const params = new URLSearchParams({
      address,
      benchmark: 'Public_AR_Current',
      format: 'json'
    });
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'RailroadHomeCheck/0.1' } });
    if (!response.ok) throw new Error(`Census geocoder returned ${response.status}`);
    const data = await response.json();
    const match = data?.result?.addressMatches?.[0];
    if (!match?.coordinates) return res.status(404).json({ error: 'We could not match that address. Try a full street address with city, state, and ZIP code.' });

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({
      lat: Number(match.coordinates.y),
      lon: Number(match.coordinates.x),
      matchedAddress: match.matchedAddress || address
    });
  } catch (error) {
    console.error('geocode error', error);
    return res.status(502).json({ error: 'Address lookup is temporarily unavailable. Please try again.' });
  }
}
