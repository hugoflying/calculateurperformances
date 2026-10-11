/**
 * Archive des fiches de préparation — Cloudflare Pages Function
 * Route : /api/fiches
 *
 *   POST  (depuis l'application)      enregistre une fiche, sans doublon
 *   GET   (depuis archives.html)      liste ou détail, protégé par mot de passe
 *
 * Réglages nécessaires dans Cloudflare (voir le guide) :
 *   - liaison D1 nommée  DB
 *   - secret            ARCHIVE_PASSWORD
 * La table est créée automatiquement au premier appel.
 */

const MAX_BYTES = 300000;
const ID_RE = /^ACBT-\d{8}-\d{4}-[A-Z0-9]{4}$/;

let tableReady = false;
async function ensureTable(db) {
  if (tableReady) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS fiches (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    received_at TEXT NOT NULL,
    pilot TEXT,
    aircraft TEXT,
    dep_icao TEXT,
    arr_icao TEXT,
    dep_verdict TEXT,
    arr_verdict TEXT,
    fuel_verdict TEXT,
    hash TEXT NOT NULL,
    hash_ok INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_fiches_created ON fiches(created_at)').run();
  tableReady = true;
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

/* JSON canonique : identique à celui de l'application, pour vérifier l'empreinte */
function canon(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort()
    .map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch (e) { return false; }
}

function checkPassword(request, env) {
  const expected = env.ARCHIVE_PASSWORD || '';
  const auth = request.headers.get('Authorization') || '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

const verdict = s => (s && s.result) ? s.result.verdict : null;
const str = (v, n) => (typeof v === 'string' ? v : '').slice(0, n);

/* ── Réception d'une fiche ── */
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'Base D1 non reliée (liaison DB manquante).' }, 503);
  if (!sameOrigin(request)) return json({ ok: false, error: 'Origine refusée.' }, 403);
  const len = +(request.headers.get('Content-Length') || 0);
  if (len > MAX_BYTES) return json({ ok: false, error: 'Fiche trop volumineuse.' }, 413);

  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'JSON invalide.' }, 400); }
  const { id, created, hash, data } = body || {};
  if (!ID_RE.test(id || '')) return json({ ok: false, error: 'Numéro de fiche invalide.' }, 400);
  if (!/^[0-9a-f]{64}$/.test(hash || '')) return json({ ok: false, error: 'Empreinte invalide.' }, 400);
  if (!data || typeof data !== 'object' || data.id !== id || isNaN(Date.parse(created))) {
    return json({ ok: false, error: 'Fiche incomplète.' }, 400);
  }
  const payload = JSON.stringify(data);
  if (payload.length > MAX_BYTES) return json({ ok: false, error: 'Fiche trop volumineuse.' }, 413);

  // Vérifie que le contenu correspond à l'empreinte calculée sur l'appareil
  const c = Object.assign({}, data); delete c.hash;
  const hashOk = (await sha256Hex(canon(c))) === hash ? 1 : 0;

  await ensureTable(env.DB);
  const received = new Date().toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO fiches
      (id, created_at, received_at, pilot, aircraft, dep_icao, arr_icao, dep_verdict, arr_verdict, fuel_verdict, hash, hash_ok, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, new Date(created).toISOString(), received,
      str(data.pilot, 80), str(data.aircraft && data.aircraft.immat, 12),
      str(data.dep && data.dep.icao, 4), str(data.arr && data.arr.icao, 4),
      verdict(data.dep), verdict(data.arr), data.fuel ? (data.fuel.ok ? 'ok' : 'bad') : null,
      hash, hashOk, payload)
    .run();

  const row = await env.DB.prepare('SELECT received_at, hash FROM fiches WHERE id = ?').bind(id).first();
  return json({ ok: true, id, received_at: row.received_at, hash_ok: !!hashOk, conflict: row.hash !== hash || undefined });
}

/* ── Consultation (page archives.html) ── */
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'Base D1 non reliée (liaison DB manquante).' }, 503);
  if (!env.ARCHIVE_PASSWORD) return json({ ok: false, error: 'Mot de passe des archives non défini (ARCHIVE_PASSWORD).' }, 503);
  if (!checkPassword(request, env)) return json({ ok: false, error: 'Mot de passe incorrect.' }, 401);
  await ensureTable(env.DB);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (id) {
    const row = await env.DB.prepare('SELECT * FROM fiches WHERE id = ?').bind(id).first();
    if (!row) return json({ ok: false, error: 'Fiche introuvable.' }, 404);
    row.data = JSON.parse(row.payload); delete row.payload;
    return json({ ok: true, fiche: row });
  }

  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '300', 10) || 300, 1), 1000);
  const q = (url.searchParams.get('q') || '').trim();
  const cols = 'id, created_at, received_at, pilot, aircraft, dep_icao, arr_icao, dep_verdict, arr_verdict, fuel_verdict, hash_ok';
  let stmt;
  if (q) {
    const like = '%' + q.replace(/[%_]/g, '') + '%';
    stmt = env.DB.prepare(`SELECT ${cols} FROM fiches
      WHERE id LIKE ?1 OR pilot LIKE ?1 OR aircraft LIKE ?1 OR dep_icao LIKE ?1 OR arr_icao LIKE ?1
      ORDER BY created_at DESC LIMIT ?2`).bind(like, limit);
  } else {
    stmt = env.DB.prepare(`SELECT ${cols} FROM fiches ORDER BY created_at DESC LIMIT ?1`).bind(limit);
  }
  const { results } = await stmt.all();
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM fiches').first();
  return json({ ok: true, total: total ? total.n : results.length, fiches: results });
}
