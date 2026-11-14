#!/usr/bin/env node
// devloop — small CLI over the Supabase Management API (https://api.supabase.com/v1).
// Node 22, no dependencies.
//
//   export SUPABASE_ACCESS_TOKEN=…          (a dummy value is fine behind a token-injecting proxy)
//   node scripts/supabase-admin.mjs <command>
//
//   projects                               list projects (ref, name, region, status)
//   create-project --name N --org SLUG [--region eu-west-3]
//   wait-ready <ref>                       poll until ACTIVE_HEALTHY and db/auth/rest are up
//   sql <ref> <file.sql>                   run a file (split on "-- @@chunk" lines)
//   migrate <ref>                          apply supabase/migrations/*.sql, recorded in public._migrations
//   seed <ref> [--in seed/seed.json]       regenerate supabase/seed.sql and load it
//   test <ref>                             run scripts/rls-test.sql (always rolled back); exit 1 on FAIL
//   deploy-function <ref> [ai]             deploy supabase/functions/<slug> (verify_jwt off: it checks the JWT itself)
//   secrets <ref>                          list edge-function secret NAMES
//   keys <ref>                             print the project URL and the public (anon / publishable) key
//   auth-config <ref> [--site-url URL] [--redirect URL,URL]
//   embed-seed <ref>                       compute embeddings for posts that have none (after deploy-function)
//   health <ref>                           call the deployed function's public health task
//
// The access token, database password, service-role key and secrets are never printed.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 (Node >= 22.21). Behind a
// proxy (e.g. one that injects the access token) re-run ourselves with it switched on.
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const child = spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)],
    { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(child.status ?? 1);
}
const API = process.env.SUPABASE_API_URL ?? 'https://api.supabase.com';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? 'proxy-injected';
const [command, ...rest] = process.argv.slice(2);
const positional = [];
const flags = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) {
    const next = rest[i + 1];
    flags[rest[i].slice(2)] = next === undefined || next.startsWith('--') ? true : rest[++i];
  } else positional.push(rest[i]);
}

class ApiFailure extends Error {
  constructor(status, body) { super(`Management API ${status}: ${body}`); this.status = status; }
}
const scrub = (text) => String(text)
  .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<jwt>')
  .replace(/sb_secret_[A-Za-z0-9_-]+/g, '<secret-key>')
  .replace(/sbp_[A-Za-z0-9_-]+/g, '<access-token>');

async function api(method, path, body, { form } = {}) {
  const headers = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' };
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json';
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method, headers, body: form ? body : body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    if ((res.status === 429 || res.status >= 502) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new ApiFailure(res.status, scrub(text).slice(0, 1500));
    try { return text ? JSON.parse(text) : null; } catch { return text; }
  }
}

const ref = () => {
  const r = positional[0];
  if (!/^[a-z]{20}$/.test(r ?? '')) fail('expected a 20-letter project ref as first argument');
  return r;
};
function fail(message) { console.error(`error: ${message}`); process.exit(1); }
const sql = (r, query) => api('POST', `/v1/projects/${r}/database/query`, { query });
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const chunksOf = (text) => text.split(/^-- @@chunk\s*$/m).map((c) => c.trim()).filter(Boolean);

async function runFile(r, file, { quiet = false } = {}) {
  const parts = chunksOf(readFileSync(file, 'utf8'));
  let last = null;
  for (let i = 0; i < parts.length; i++) {
    last = await sql(r, parts[i]);
    if (!quiet) console.log(`  ${relative(root, file)} — chunk ${i + 1}/${parts.length} ok`);
  }
  return last;
}

async function apiKeys(r) {
  const keys = await api('GET', `/v1/projects/${r}/api-keys?reveal=true`);
  const find = (pred) => keys.find(pred)?.api_key ?? null;
  return {
    anon: find((k) => k.name === 'anon' && (k.type === 'legacy' || !k.type)),
    publishable: find((k) => k.type === 'publishable'),
    serviceRole: find((k) => k.name === 'service_role' && (k.type === 'legacy' || !k.type)),
    secret: find((k) => k.type === 'secret'),
  };
}

const commands = {
  async projects() {
    for (const p of await api('GET', '/v1/projects')) {
      console.log(`${p.ref}  ${p.status.padEnd(16)} ${p.region.padEnd(14)} ${p.name}`);
    }
  },

  async 'create-project'() {
    if (!flags.name || !flags.org) fail('usage: create-project --name NAME --org ORG_SLUG [--region eu-west-3]');
    const project = await api('POST', '/v1/projects', {
      name: flags.name, organization_slug: flags.org,
      db_pass: randomBytes(24).toString('base64url'),   // generated, never shown: reset it in the dashboard if needed
      region_selection: { type: 'specific', code: flags.region ?? 'eu-west-3' },
    });
    console.log(`created project ${project.ref} (${project.name}, ${project.region}) — status ${project.status}`);
    console.log('the database password was generated and not displayed; reset it in Dashboard → Database if you need it');
  },

  async 'wait-ready'() {
    const r = ref();
    for (let i = 0; i < 90; i++) {
      const p = await api('GET', `/v1/projects/${r}`);
      let services = [];
      if (p.status === 'ACTIVE_HEALTHY') {
        services = await api('GET', `/v1/projects/${r}/health?services=db,auth,rest`).catch(() => []);
        if (services.length && services.every((s) => s.status === 'ACTIVE_HEALTHY')) {
          console.log(`${r} is ready (postgres ${p.database?.version ?? '?'}, ${p.region})`);
          return;
        }
      }
      console.log(`  ${p.status} ${services.map((s) => `${s.name}:${s.status}`).join(' ')}`);
      await new Promise((res) => setTimeout(res, 10_000));
    }
    fail('the project did not become ready within 15 minutes');
  },

  async sql() {
    const r = ref();
    if (!positional[1]) fail('usage: sql <ref> <file.sql>');
    const out = await runFile(r, resolve(process.cwd(), positional[1]));
    if (Array.isArray(out) && out.length) console.table(out.slice(0, 200));
  },

  async migrate() {
    const r = ref();
    const who = await sql(r, 'select current_user as role, current_setting(\'server_version\') as version');
    console.log(`connected as ${who[0].role} (postgres ${who[0].version})`);
    await sql(r, `create table if not exists public._migrations (
        name text primary key, checksum text not null, applied_at timestamptz not null default now());
      alter table public._migrations enable row level security;
      revoke all on public._migrations from anon, authenticated, public;`);
    const done = new Map((await sql(r, 'select name, checksum from public._migrations')).map((m) => [m.name, m.checksum]));
    const dir = join(root, 'supabase/migrations');
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      const text = readFileSync(join(dir, name), 'utf8');
      const checksum = createHash('sha256').update(text).digest('hex');
      if (done.get(name) === checksum) { console.log(`  skip    ${name}`); continue; }
      await sql(r, text);
      await sql(r, `insert into public._migrations (name, checksum) values (${lit(name)}, ${lit(checksum)})
        on conflict (name) do update set checksum = excluded.checksum, applied_at = now()`);
      console.log(`  ${done.has(name) ? 'changed' : 'applied'} ${name}`);
    }
    // 0007 sweeps function privileges; if an earlier file was re-applied alone, make sure the sweep ran last.
    await sql(r, readFileSync(join(dir, readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().at(-1)), 'utf8'));
    console.log('migrations are up to date');
  },

  async seed() {
    const r = ref();
    const input = typeof flags.in === 'string' ? flags.in : 'seed/seed.json';
    if (!existsSync(resolve(root, input))) fail(`${input} does not exist`);
    const gen = spawnSync(process.execPath, [join(root, 'scripts/seed.mjs'), '--in', input], { stdio: 'inherit' });
    if (gen.status !== 0) fail('seed.mjs failed');
    await runFile(r, join(root, 'supabase/seed.sql'));
    const [c] = await sql(r, `select (select count(*) from public.profiles) as profiles, (select count(*) from public.posts) as posts,
      (select count(*) from public.answers) as answers, (select count(*) from public.messages) as messages,
      (select count(*) from public.posts where embedding is null) as posts_without_embedding`);
    console.log('seeded:', JSON.stringify(c));
  },

  async test() {
    const r = ref();
    const parts = chunksOf(readFileSync(join(root, 'scripts/rls-test.sql'), 'utf8'));
    let rows = [];
    try {
      await sql(r, parts[0]);
      rows = await sql(r, parts[1]);
    } finally {
      await sql(r, parts[2]).catch(() => {});
    }
    const failed = rows.filter((x) => x.result === 'FAIL');
    for (const x of rows) {
      if (x.result !== 'PASS' || flags.verbose) console.log(`${x.result}  ${x.name}${x.detail ? ` — ${x.detail}` : ''}`);
    }
    if (failed.length || !rows.some((x) => x.result === 'SUMMARY' && x.detail === 'ALL PASS')) process.exit(1);
  },

  async 'deploy-function'() {
    const r = ref();
    const slug = positional[1] ?? 'ai';
    const dir = join(root, 'supabase/functions', slug);
    const files = readdirSync(dir).filter((f) => /\.(ts|js|json)$/.test(f) && !f.endsWith('.test.ts'));
    if (!files.includes('index.ts')) fail(`${relative(root, dir)}/index.ts not found`);
    const form = new FormData();
    form.append('metadata', JSON.stringify({ entrypoint_path: 'index.ts', name: slug, verify_jwt: false }));
    for (const f of files) form.append('file', new Blob([readFileSync(join(dir, f))], { type: 'application/typescript' }), f);
    const out = await api('POST', `/v1/projects/${r}/functions/deploy?slug=${encodeURIComponent(slug)}`, form, { form: true });
    console.log(`deployed function ${out.slug} v${out.version} (${out.status}, verify_jwt=${out.verify_jwt}) — ${files.join(', ')}`);
  },

  async secrets() {
    const list = await api('GET', `/v1/projects/${ref()}/secrets`);
    console.log(list.map((s) => s.name).sort().join('\n'));
  },

  async keys() {
    const r = ref();
    const k = await apiKeys(r);
    console.log(`VITE_SUPABASE_URL=https://${r}.supabase.co`);
    console.log(`VITE_SUPABASE_ANON_KEY=${k.anon ?? k.publishable ?? ''}`);
    if (k.anon && k.publishable) console.log(`# publishable key (new format, also usable in the browser): ${k.publishable}`);
  },

  async 'auth-config'() {
    const r = ref();
    const body = {
      external_email_enabled: true,
      external_anonymous_users_enabled: true,   // one-click guest session
      mailer_autoconfirm: true,                 // the jury signs up without a confirmation e-mail
      disable_signup: false,
      password_min_length: 8,
    };
    if (typeof flags['site-url'] === 'string') body.site_url = flags['site-url'];
    if (typeof flags.redirect === 'string') body.uri_allow_list = flags.redirect;
    const out = await api('PATCH', `/v1/projects/${r}/config/auth`, body);
    console.log(JSON.stringify(Object.fromEntries(
      [...Object.keys(body), 'site_url', 'uri_allow_list', 'external_github_enabled'].map((k) => [k, out[k]])), null, 2));
  },

  async 'embed-seed'() {
    const r = ref();
    const k = await apiKeys(r);
    const url = `https://${r}.supabase.co/functions/v1/ai`;
    let total = 0;
    for (let round = 0; round < 200; round++) {
      let res = null;
      for (const key of [k.serviceRole, k.secret].filter(Boolean)) {
        res = await fetch(url, {
          method: 'POST', headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: 'embed_missing', limit: Number(flags.batch) || 2 }), signal: AbortSignal.timeout(120_000),
        });
        if (res.status !== 401 && res.status !== 403) break;
      }
      const text = await res.text();
      if (!res.ok) fail(`embed_missing failed: ${res.status} ${scrub(text).slice(0, 300)}`);
      const out = JSON.parse(text);
      total += out.embedded ?? 0;
      console.log(`  embedded ${out.embedded}, remaining ${out.remaining}${out.error ? ` (${out.error})` : ''}`);
      if (!out.remaining || !out.embedded) break;
    }
    console.log(`done: ${total} embeddings stored`);
  },

  async health() {
    const res = await fetch(`https://${ref()}.supabase.co/functions/v1/ai`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: 'health' }),
    });
    console.log(res.status, scrub(await res.text()));
  },
};

if (!command || !commands[command]) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 22).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(command ? 1 : 0);
}
commands[command]().catch((e) => fail(scrub(e.message)));
