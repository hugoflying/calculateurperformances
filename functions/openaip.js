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
    const headers = {
      'x-openaip-api-key': env.OPENAIP_KEY,
      'Accept': 'application/json',
    };

    // Filtre par icaoCode avec le header d'auth (pas de CORS côté serveur)
    const listRes = await fetch(
      `https://api.core.openaip.net/api/airports?icaoCode=${icao}&limit=5`,
      { headers }
    );
    const listData = await listRes.json();

    // Debug : retourner le totalCount pour diagnostic
    if (!listRes.ok || !listData.items?.length) return new Response(
      JSON.stringify({ error: 'Liste vide', totalCount: listData.totalCount, status: listRes.status }),
      { status: 404, headers: corsHeaders }
    );

    const match = listData.items.find(a =>
      (a.icaoCode || '').toUpperCase() === icao
    );
    if (!match) return new Response(
      JSON.stringify({ error: icao + ' non trouvé', totalCount: listData.totalCount, firstItem: listData.items[0]?.icaoCode }),
      { status: 404, headers: corsHeaders }
    );

    // Détail complet avec pistes
    const detailRes = await fetch(
      `https://api.core.openaip.net/api/airports/${match._id}`,
      { headers }
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
