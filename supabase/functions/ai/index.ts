// devloop — AI gateway (Supabase Edge Function).
// Tasks: similar (semantic search), embed_post, embed_missing (service key only), triage, draft, health.
// Rules: provider keys live only here; every failure degrades to `{ degraded: true }` so the
// client falls back to its local heuristic — this function never breaks the app.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const PROVIDERS = [
  { name: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: 'GROQ_API_KEY', model: Deno.env.get('GROQ_MODEL') ?? '', models: 'https://api.groq.com/openai/v1/models' },
  { name: 'mistral', url: 'https://api.mistral.ai/v1/chat/completions', key: 'MISTRAL_API_KEY', model: Deno.env.get('MISTRAL_MODEL') ?? 'mistral-small-latest', models: 'https://api.mistral.ai/v1/models' },
].filter((p) => Deno.env.get(p.key));
const AI_DISABLED = Deno.env.get('AI_DISABLED') === '1';

function cors(origin: string | null): Record<string, string> {
  const extra = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = origin && (/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(workers|pages)\.dev$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin) || extra.includes(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin! : 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

// ── Embeddings (built-in gte-small, 384 dimensions, no API key) ──────────────
// deno-lint-ignore no-explicit-any
let session: any = null;
async function embed(text: string): Promise<number[] | null> {
  try {
    // deno-lint-ignore no-explicit-any
    session ??= new (globalThis as any).Supabase.ai.Session('gte-small');
    const out = await session.run(text.slice(0, 2000), { mean_pool: true, normalize: true });
    return Array.isArray(out) && out.length === 384 ? out : null;
  } catch {
    return null;
  }
}
const postText = (p: { title: string; body_md?: string | null; code?: string | null }) => `${p.title}\n${(p.body_md ?? '').slice(0, 1200)}\n${(p.code ?? '').slice(0, 400)}`;

// ── Chat providers ───────────────────────────────────────────────────────────
let lastProviderIssue = '';
// Model ids change often: when none is configured (or the configured one is gone), ask the
// provider what exists and pick the best general chat model. Cached for the worker's lifetime.
const PREFERRED = [/gpt-oss-120b/, /llama-3\.3-70b/, /llama-?4.*70b/, /70b/, /qwen/, /gpt-oss/, /mistral-small/, /llama/];
const chosen = new Map<string, string>();
async function pickModel(p: (typeof PROVIDERS)[number], force = false): Promise<string> {
  if (!force && (chosen.get(p.name) || p.model)) return chosen.get(p.name) || p.model;
  try {
    const res = await fetch(p.models, { headers: { Authorization: `Bearer ${Deno.env.get(p.key)}` }, signal: AbortSignal.timeout(5000) });
    const ids: string[] = ((await res.json())?.data ?? [])
      .map((m: { id?: string }) => String(m.id ?? ''))
      .filter((id: string) => id && !/whisper|guard|tts|embed|vision|audio|moderation|ocr|safeguard/i.test(id));
    for (const pattern of PREFERRED) {
      const match = ids.find((id) => pattern.test(id));
      if (match) {
        chosen.set(p.name, match);
        return match;
      }
    }
    if (ids[0]) chosen.set(p.name, ids[0]);
  } catch {
    // keep whatever we had
  }
  return chosen.get(p.name) || p.model;
}
async function chatJson(system: string, user: string): Promise<{ data: Record<string, unknown>; provider: string; model: string } | null> {
  lastProviderIssue = '';
  for (const p of PROVIDERS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const model = await pickModel(p, attempt === 1);
        if (!model) break;
        const res = await fetch(p.url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${Deno.env.get(p.key)}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: 900,
            response_format: { type: 'json_object' },
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          }),
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) {
          // Status and provider error code only: never the raw provider message.
          const issue = await res.json().catch(() => null);
          const code = String(issue?.error?.code ?? issue?.error?.type ?? '').slice(0, 60);
          lastProviderIssue = `${p.name}:${res.status}:${code}`;
          if (attempt === 0 && (res.status === 404 || /model/.test(code))) continue; // look the model up and retry once
          break;
        }
        const body = await res.json();
        const data = JSON.parse(body?.choices?.[0]?.message?.content ?? 'null');
        if (data && typeof data === 'object') return { data, provider: p.name, model };
        lastProviderIssue = `${p.name}:invalid_json`;
        break;
      } catch (error) {
        lastProviderIssue = `${p.name}:${error instanceof Error ? error.name : 'error'}`;
        break;
      }
    }
  }
  return null;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const LEVELS = ['beginner', 'intermediate', 'senior'];

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get('origin')), 'Content-Type': 'application/json' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'validation' }, 400);
  }
  const task = body.task;

  if (task === 'health') {
    const vector = await embed('health check');
    return json({ embeddings: vector ? 'ok' : 'down', providers: PROVIDERS.map((p) => p.name), aiDisabled: AI_DISABLED });
  }

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');

  if (task === 'embed_missing') {
    if (token !== SERVICE_KEY) return json({ error: 'forbidden' }, 403);
    const limit = Math.min(Number(body.limit) || 8, 16);
    const { data: rows } = await admin.from('posts').select('id, title, body_md, code').is('embedding', null).limit(limit);
    let embedded = 0;
    for (const row of rows ?? []) {
      const vector = await embed(postText(row));
      if (!vector) break;
      const { error } = await admin.from('posts').update({ embedding: JSON.stringify(vector) }).eq('id', row.id);
      if (!error) embedded++;
    }
    const { count } = await admin.from('posts').select('id', { count: 'exact', head: true }).is('embedding', null);
    return json({ embedded, remaining: count ?? 0 });
  }

  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return json({ error: 'unauthenticated' }, 401);
  const asUser = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });

  if (task === 'similar') {
    const text = str(body.text, 2000);
    const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 10);
    if (text.trim().length < 6) return json({ posts: [], mode: 'semantic' });
    const vector = await embed(text);
    if (vector) {
      const { data, error } = await asUser.rpc('match_posts', { p_embedding: JSON.stringify(vector), p_limit: 20, p_min_sim: 0.845 });
      if (!error && Array.isArray(data) && data.some((post) => post.kind === 'problem')) {
        // gte-small scores are tightly packed: keep only what is close to the best match and
        // rescale to a readable 0..1 so the UI never shows "83 % close" for an unrelated post.
        const sorted = data.filter((post) => post.kind === 'problem').sort((x, y) => y.similarity - x.similarity);
        const best = sorted[0].similarity;
        const posts = sorted
          .filter((post) => post.similarity >= best - 0.012)
          .slice(0, limit)
          .map((post) => ({ ...post, similarity: Math.max(0, Math.min(1, (post.similarity - 0.78) / 0.12)) }));
        return json({ posts, mode: 'semantic' });
      }
      // Embeddings worked and nothing is close: say so instead of returning keyword noise.
      if (!error) return json({ posts: [], mode: 'semantic' });
    }
    const { data } = await asUser.rpc('search_posts', { p_query: text.slice(0, 300), p_limit: limit, p_status: null });
    return json({ posts: data ?? [], mode: 'keyword' });
  }

  if (task === 'embed_post') {
    const { data: post } = await admin.from('posts').select('id, author_id, title, body_md, code').eq('id', str(body.postId, 64)).maybeSingle();
    if (!post || post.author_id !== user.id) return json({ ok: false });
    const vector = await embed(postText(post));
    if (!vector) return json({ ok: false });
    const { error } = await admin.from('posts').update({ embedding: JSON.stringify(vector) }).eq('id', post.id);
    return json({ ok: !error });
  }

  if (task === 'triage' || task === 'draft') {
    if (AI_DISABLED || PROVIDERS.length === 0) return json({ degraded: true });
    const locale = body.locale === 'en' ? 'en' : 'fr';
    const language = locale === 'en' ? 'English' : 'French';
    let system: string;
    let prompt: string;
    let slugs: string[] = [];
    if (task === 'triage') {
      const { data: interests } = await admin.from('interests').select('slug');
      slugs = (interests ?? []).map((i) => i.slug);
      system = `You triage developer problems for a Q&A community. Answer in ${language} with strict JSON: {"tags": string[] (1-3 items, ONLY from this list: ${slugs.join(', ')}), "difficulty": "beginner"|"intermediate"|"senior", "summary": string (max 2 short sentences), "hints": string[] (2-3 concrete things to try first)}. Be accurate and humble; never invent APIs.`;
      prompt = `Title: ${str(body.title, 160)}\n\n${str(body.bodyMd, 4000)}\n\nCode (${str(body.language, 20)}):\n${str(body.code, 4000)}`;
    } else {
      const { data: post } = await asUser.rpc('get_post', { p_id: str(body.postId, 64) });
      if (!post) return json({ degraded: true });
      system = `You draft an answer to a developer's problem. Answer in ${language} with strict JSON: {"answerMd": string (markdown: likely cause, then the fix with a short code example if useful; say clearly when you are unsure; max 250 words)}. A human will review it before posting.`;
      prompt = `Title: ${post.title}\n\n${String(post.bodyMd ?? '').slice(0, 4000)}\n\nCode:\n${String(post.code ?? '').slice(0, 4000)}`;
    }
    const hash = await sha256(`${task}|${locale}|${prompt}`);
    const { data: cached } = await admin.from('ai_cache').select('response, provider').eq('hash', hash).maybeSingle();
    if (cached) return json({ ...cached.response, provider: cached.provider, cached: true, degraded: false });

    const { data: budget } = await admin.rpc('ai_consume', { p_user_id: user.id });
    if (!budget?.allowed) return json({ degraded: true, reason: 'budget' });
    const result = await chatJson(system, prompt);
    if (!result) return json({ degraded: true, reason: lastProviderIssue || 'provider' });

    let response: Record<string, unknown> | null = null;
    if (task === 'triage') {
      const tags = Array.isArray(result.data.tags) ? result.data.tags.filter((t): t is string => typeof t === 'string' && slugs.includes(t)).slice(0, 3) : [];
      const hints = Array.isArray(result.data.hints) ? result.data.hints.filter((h): h is string => typeof h === 'string').map((h) => h.slice(0, 300)).slice(0, 3) : [];
      const summary = str(result.data.summary, 400);
      if (tags.length && summary && LEVELS.includes(String(result.data.difficulty))) response = { tags, difficulty: result.data.difficulty, summary, hints };
    } else {
      const answerMd = str(result.data.answerMd, 6000);
      if (answerMd.length > 20) response = { answerMd };
    }
    if (!response) return json({ degraded: true, reason: 'invalid_output' });
    await admin.from('ai_cache').upsert({ hash, task, response, provider: result.provider });
    return json({ ...response, provider: result.provider, model: result.model, cached: false, degraded: false });
  }

  return json({ error: 'validation' }, 400);
});
