export async function onRequest({ request, env }) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const url  = new URL(request.url);
  const icao = url.searchParams.get('icao')?.toUpperCase();

  if (!icao) return new Response(JSON.stringify({ error: 'icao manquant' }), { status: 400, headers: cors });

  try {
    // 1. Coords via aviationweather.gov (gratuit, sans clé, pas de blocage serveur)
    const awRes = await fetch(
      `https://aviationweather.gov/api/data/airport?ids=${icao}&format=json`
    );
    if (!awRes.ok) throw new Error('aviationweather.gov ' + awRes.status);
    const awData = await awRes.json();
    const apt = Array.isArray(awData) ? awData[0] : awData;
    const lat = apt?.lat, lon = apt?.lon;
    if (!lat || !lon) throw new Error('Coordonnées introuvables pour ' + icao);

    // 2. OpenAIP géo — rayon 5 km
    const geoRes = await fetch(
      `https://api.core.openaip.net/api/airports?pos=${lon},${lat}&dist=5000&limit=10`,
      { headers: { 'x-openaip-api-key': env.OPENAIP_KEY } }
    );
    const geoData = await geoRes.json();
    const match   = (geoData.items || []).find(a => (a.icaoCode || '').toUpperCase() === icao);
    if (!match) throw new Error(icao + ' absent (autour trouvé : ' + (geoData.items||[]).map(a => a.icaoCode).join(', ') + ')');

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
