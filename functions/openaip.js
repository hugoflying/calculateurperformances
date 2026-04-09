export async function onRequest({ request, env }) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const icao = new URL(request.url).searchParams.get('icao')?.toUpperCase();
  if (!icao) return new Response(JSON.stringify({ error: 'icao manquant' }), { status: 400, headers: cors });

  try {
    const headers = { 'x-openaip-api-key': env.OPENAIP_KEY, 'Accept': 'application/json' };
    const base    = 'https://api.core.openaip.net/api/airports';

    const listRes = await fetch(`${base}?search=${icao}&limit=10`, { headers });
    const listData = await listRes.json();

    const match = (listData.items || []).find(a =>
      (a.icaoCode || '').toUpperCase() === icao
    );
    if (!match) throw new Error(icao + ' non trouvé');

    const detailRes = await fetch(`${base}/${match._id}`, { headers });
    const airport   = await detailRes.json();

    return new Response(JSON.stringify(airport), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}
