// Worker do site: serve os arquivos estáticos e oferece créditos gratuitos de IA.
// A chave da API fica só no Cloudflare (secret ANTHROPIC_API_KEY) — nunca vai para o navegador.
// Variáveis (opcionais): FREE_MODEL, FREE_CENTS_PER_USER (cota diária por pessoa, em centavos de dólar),
// FREE_CENTS_TOTAL (teto diário do site inteiro, em centavos de dólar).
import { DurableObject } from 'cloudflare:workers';

const PRICES = { // US$ por milhão de tokens [entrada, saída]
  'claude-haiku-5-5': [0.10, 0.50], 'claude-sonnet-5-5': [2, 10], 'claude-opus-5-5': [4, 20],
};
const cfg = (env) => ({
  model: env.FREE_MODEL || 'claude-sonnet-5-5',
  user: Number(env.FREE_CENTS_PER_USER ?? 25),
  total: Number(env.FREE_CENTS_TOTAL ?? 100),
});
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const today = () => new Date().toISOString().slice(0, 10);
function who(req) {
  const email = req.headers.get('cf-access-authenticated-user-email');
  return email ? 'e:' + email.toLowerCase() : 'ip:' + (req.headers.get('cf-connecting-ip') || 'desconhecido');
}
function cents(model, u) {
  const [pi, po] = PRICES[model] || PRICES['claude-opus-5-5'];
  const inTok = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1;
  return (inTok * pi + (u.output_tokens || 0) * po) / 1e6 * 100;
}

export class Quota extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS spend (day TEXT, uid TEXT, cents REAL, PRIMARY KEY (day, uid))');
  }
  get(day, uid) {
    const one = (u) => this.ctx.storage.sql.exec('SELECT cents FROM spend WHERE day = ? AND uid = ?', day, u).toArray()[0]?.cents || 0;
    return { user: one(uid), total: one('*') };
  }
  add(day, uid, c) {
    for (const u of [uid, '*']) this.ctx.storage.sql.exec('INSERT INTO spend (day, uid, cents) VALUES (?, ?, ?) ON CONFLICT (day, uid) DO UPDATE SET cents = cents + excluded.cents', day, u, c);
    this.ctx.storage.sql.exec('DELETE FROM spend WHERE day < ?', new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
  }
}

async function status(req, env) {
  const c = cfg(env);
  if (!env.ANTHROPIC_API_KEY || !(c.user > 0) || !(c.total > 0)) return { enabled: false };
  const q = env.QUOTA.get(env.QUOTA.idFromName('global'));
  const s = await q.get(today(), who(req));
  const left = Math.max(0, Math.min(c.user - s.user, c.total - s.total));
  return { enabled: true, model: c.model, remaining_pct: Math.round(100 * left / c.user), site_exhausted: s.total >= c.total, user_exhausted: s.user >= c.user };
}

async function messages(req, env) {
  const st = await status(req, env);
  if (!st.enabled) return json({ error: { message: 'Créditos gratuitos não estão ativados neste site.' } }, 503);
  if (st.site_exhausted) return json({ error: { type: 'free_quota', message: 'Os créditos gratuitos do site acabaram por hoje. Volte amanhã ou use sua própria chave.' } }, 429);
  if (st.user_exhausted) return json({ error: { type: 'free_quota', message: 'Seus créditos gratuitos de hoje acabaram. Volte amanhã ou use sua própria chave.' } }, 429);
  let body; try { body = await req.json(); } catch { return json({ error: { message: 'JSON inválido' } }, 400); }
  const c = cfg(env);
  // o servidor decide modelo e limites: o navegador não pode escolher algo mais caro
  const clean = { model: c.model, max_tokens: Math.min(Number(body.max_tokens) || 8000, 16000), system: body.system, tools: body.tools, messages: body.messages };
  if (c.model !== 'claude-haiku-5-5') clean.output_config = { effort: 'medium' };
  if (JSON.stringify(clean).length > 4e6) return json({ error: { message: 'Pedido grande demais.' } }, 413);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(clean),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.usage) {
    const q = env.QUOTA.get(env.QUOTA.idFromName('global'));
    await q.add(today(), who(req), cents(c.model, data.usage));
  }
  return json(data, res.status);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/ai/status') return json(await status(req, env));
    if (url.pathname === '/api/ai/messages' && req.method === 'POST') return messages(req, env);
    if (url.pathname.startsWith('/api/')) return json({ error: { message: 'não encontrado' } }, 404);
    return env.ASSETS.fetch(req);
  },
};
