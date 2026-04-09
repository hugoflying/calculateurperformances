export async function onRequest({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  const url = new URL(request.url);
  const icao = url.searchParams.get('icao')?.toUpperCase();

  if (!icao) return new Response(
    JSON.stringify({ error: 'Paramètre icao manquant' }),
    { status: 400, headers: corsHeaders }
  );

  try {
    // 1. Chercher l'aéroport par icaoCode (côté serveur = pas de CORS)
    const listRes = await fetch(
      `https://api.core.openaip.net/api/airports?icaoCode=${icao}&limit=5&apiKey=${env.OPENAIP_KEY}`
    );
    const listData = await listRes.json();

    const match = (listData.items || []).find(a =>
      (a.icaoCode || '').toUpperCase() === icao
    );
    if (!match) return new Response(
      JSON.stringify({ error: icao + ' non trouvé', totalCount: listData.totalCount }),
      { status: 404, headers: corsHeaders }
    );

    // 2. Détail complet avec pistes
    const detailRes = await fetch(
      `https://api.core.openaip.net/api/airports/${match._id}?apiKey=${env.OPENAIP_KEY}`
    );
    const airport = await detailRes.json();

    return new Response(JSON.stringify(airport), { headers: corsHeaders });

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: corsHeaders }
    );
  }
}
