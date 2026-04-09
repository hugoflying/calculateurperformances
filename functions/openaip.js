export async function onRequest({ request, env }) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const url  = new URL(request.url);
  const icao = url.searchParams.get('icao')?.toUpperCase();

  if (!icao) return new Response(JSON.stringify({ error: 'icao manquant' }), { status: 400, headers: cors });

  try {
    // 1. Coords via AVWX (déjà utilisé dans l'appli)
    const stationRes = await fetch(
      `https://avwx.rest/api/station/${icao}`,
      { headers: { Authorization: `Bearer ${env.AVWX_TOKEN}` } }
    );
    if (!stationRes.ok) throw new Error('AVWX station ' + stationRes.status);
    const station = await stationRes.json();
    const lat = station.latitude, lon = station.longitude;
    if (!lat || !lon) throw new Error('Coordonnées manquantes pour ' + icao);

    // 2. OpenAIP géo — rayon 5 km autour de l'aéroport
    const geoRes = await fetch(
      `https://api.core.openaip.net/api/airports?pos=${lon},${lat}&dist=5000&limit=10`,
      { headers: { 'x-openaip-api-key': env.OPENAIP_KEY } }
    );
    const geoData = await geoRes.json();
    const match   = (geoData.items || []).find(a => (a.icaoCode || '').toUpperCase() === icao);
    if (!match) throw new Error(icao + ' absent du résultat géo (trouvé : ' + (geoData.items||[]).map(a=>a.icaoCode).join(', ') + ')');

    // 3. Détail complet avec pistes
    const detailRes = await fetch(
      `https://api.core.openaip.net/api/airports/${match._id}`,
      { headers: { 'x-openaip-api-key': env.OPENAIP_KEY } }
    );
    const airport = await detailRes.json();
    return new Response(JSON.stringify(airport), { headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}
