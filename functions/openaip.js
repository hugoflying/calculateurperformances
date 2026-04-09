export async function onRequest({ request, env }) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const icao = new URL(request.url).searchParams.get('icao')?.toUpperCase();
  if (!icao) return new Response(JSON.stringify({ error: 'icao manquant' }), { status: 400, headers: cors });

  try {
    const headers = { 'x-openaip-api-key': env.OPENAIP_KEY, 'Accept': 'application/json' };
    const base    = 'https://api.core.openaip.net/api/airports';

    // Tester tous les noms de paramètre possibles
    const candidates = ['icaoCode', 'icao', 'code', 'ident', 'search', 'name', 'q'];
    const results = {};

    for (const param of candidates) {
      const r    = await fetch(`${base}?${param}=${icao}&limit=5`, { headers });
      const data = await r.json();
      results[param] = data.totalCount;
      // Si filtré (totalCount petit), on a trouvé le bon param
      if (data.totalCount < 50) {
        const match = (data.items || []).find(a => (a.icaoCode||'').toUpperCase() === icao) || data.items?.[0];
        if (match) {
          const det  = await fetch(`${base}/${match._id}`, { headers });
          const full = await det.json();
          return new Response(JSON.stringify({ foundWithParam: param, airport: full }), { headers: cors });
        }
      }
    }

    // Aucun param n'a filtré — retourner le diagnostic
    return new Response(JSON.stringify({ error: 'Aucun paramètre ne filtre', counts: results }), { status: 404, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}
