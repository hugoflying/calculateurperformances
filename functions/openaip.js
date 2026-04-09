export async function onRequest({ request, env }) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const icao = new URL(request.url).searchParams.get('icao')?.toUpperCase();

  if (!icao) return new Response(JSON.stringify({ error: 'icao manquant' }), { status: 400, headers: cors });

  try {
    const res = await fetch(
      `https://avwx.rest/api/station/${icao}`,
      { headers: { Authorization: `Bearer ${env.AVWX_TOKEN}` } }
    );
    if (!res.ok) throw new Error('AVWX ' + res.status);
    const station = await res.json();

    // AVWX retourne les pistes directement dans station.runways
    const runways = (station.runways || []).map(rwy => ({
      ident1:   rwy.ident1,           // ex: "04"
      ident2:   rwy.ident2,           // ex: "22"
      lengthM:  Math.round((rwy.length_ft || 0) * 0.3048),
      widthM:   Math.round((rwy.width_ft  || 0) * 0.3048),
    }));

    return new Response(JSON.stringify({ icao, runways }), { headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}
