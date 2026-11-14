#!/usr/bin/env node
// devloop — turns seed/seed.json (SPEC §11) into supabase/seed.sql.
//
//   node scripts/seed.mjs [--in seed/seed.json] [--out supabase/seed.sql]
//
// The SQL is deterministic and idempotent: seed rows are upserted by their stable ids,
// seed rows that disappeared from seed.json are removed, and nothing else is touched.
// Timestamps are relative (now() − hoursAgo) so re-running it refreshes the demo.
// The file is split into independent transactions separated by "-- @@chunk" lines so it
// can be sent piece by piece through the Management API (psql can run it whole).
// It must run as an admin role without a JWT (postgres / SQL editor / Management API):
// rate-limit and notification triggers are skipped in that case, counters stay consistent.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const inPath = resolve(root, flag('in', 'seed/seed.json'));
const outPath = resolve(root, flag('out', 'supabase/seed.sql'));
const POSTS_PER_CHUNK = 25;
const EMAIL_DOMAIN = 'seed.devloop.invalid';

const seed = JSON.parse(readFileSync(inPath, 'utf8'));

// ---------------------------------------------------------------- SQL literals
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v) => {
  if (v === null || v === undefined) return 'null';
  const s = String(v);
  if (s.includes('\0')) throw new Error('NUL character in seed text');
  return `'${s.replace(/'/g, "''")}'`;
};
const uuid = (v) => {
  if (v === null || v === undefined) return 'null';
  if (!UUID.test(v)) throw new Error(`not a uuid: ${v}`);
  return `'${v.toLowerCase()}'::uuid`;
};
const num = (v, fallback = 0) => {
  const n = Number(v ?? fallback);
  if (!Number.isFinite(n)) throw new Error(`not a number: ${v}`);
  return String(n);
};
const int = (v, fallback = 0) => String(Math.max(0, Math.round(Number(num(v, fallback)))));
const bool = (v) => (v ? 'true' : 'false');
const json = (v) => (v === null || v === undefined ? 'null' : `${str(JSON.stringify(v))}::jsonb`);
const textArray = (a) => `array[${(a ?? []).map(str).join(', ')}]::text[]`;
const uuidList = (ids) => (ids.length ? ids.map(uuid).join(', ') : `'00000000-0000-0000-0000-000000000000'::uuid`);
const ago = (amount, unit) => `now() - interval '${num(amount)} ${unit}'`;
const values = (rows) => rows.map((r) => `  (${r.join(', ')})`).join(',\n');

// ---------------------------------------------------------------- validation
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const interests = seed.interests ?? [];
const users = seed.users ?? [];
const follows = seed.follows ?? [];
const circles = seed.circles ?? [];
const posts = seed.posts ?? [];
const messages = seed.messages ?? [];
const slugs = new Set(interests.map((i) => i.slug));
const userIds = new Set(users.map((u) => u.id));
const circleIds = new Set(circles.map((c) => c.id));
const LEVELS = ['beginner', 'intermediate', 'senior'];
const reproOk = (r) => r === null || r === undefined
  || (typeof r === 'object' && ['html', 'css', 'js'].every((k) => typeof r[k] === 'string')
      && Object.keys(r).length === 3 && Buffer.byteLength(JSON.stringify(r)) <= 60000);

const unique = (list, key, label) => {
  const seen = new Set();
  for (const x of list) { check(!seen.has(x[key]), `${label}: duplicate ${key} ${x[key]}`); seen.add(x[key]); }
};
unique(interests, 'id', 'interests'); unique(interests, 'slug', 'interests');
unique(users, 'id', 'users'); unique(users, 'handle', 'users');
unique(circles, 'id', 'circles'); unique(circles, 'slug', 'circles');
unique(posts, 'id', 'posts'); unique(messages, 'id', 'messages');
unique(posts.flatMap((p) => p.answers ?? []), 'id', 'answers');

for (const u of users) {
  check(UUID.test(u.id), `user ${u.handle}: bad id`);
  check(/^[a-z0-9_]{3,24}$/.test(u.handle ?? ''), `user ${u.id}: handle must match ^[a-z0-9_]{3,24}$`);
  check((u.displayName ?? '').length >= 1 && u.displayName.length <= 60, `user ${u.handle}: displayName 1–60 chars`);
  check((u.bio ?? '').length <= 280, `user ${u.handle}: bio ≤ 280 chars`);
  check(LEVELS.includes(u.level), `user ${u.handle}: unknown level`);
  check(u.avatarUrl == null || /^(https:\/\/\S+|\/[A-Za-z0-9_./-]+)$/.test(u.avatarUrl), `user ${u.handle}: avatarUrl must be https or a local path`);
  for (const i of u.interests ?? []) {
    check(slugs.has(i.slug), `user ${u.handle}: unknown interest ${i.slug}`);
    check(i.weight >= 0 && i.weight <= 1, `user ${u.handle}: weight out of range for ${i.slug}`);
  }
}
for (const f of follows) {
  check(userIds.has(f.followerId) && userIds.has(f.followeeId), `follow ${f.followerId} → ${f.followeeId}: unknown user`);
  check(f.followerId !== f.followeeId, `follow: ${f.followerId} follows itself`);
}
for (const c of circles) {
  check(/^[a-z0-9-]{2,40}$/.test(c.slug ?? ''), `circle ${c.id}: bad slug`);
  check(c.interestSlug == null || slugs.has(c.interestSlug), `circle ${c.slug}: unknown interest ${c.interestSlug}`);
  check(c.externalInviteUrl == null || /^https:\/\/\S{1,300}$/.test(c.externalInviteUrl), `circle ${c.slug}: invite url must be https`);
  for (const m of c.memberIds ?? []) check(userIds.has(m), `circle ${c.slug}: unknown member ${m}`);
}
for (const p of posts) {
  const at = `post ${p.id}`;
  check(userIds.has(p.authorId), `${at}: unknown author`);
  check(p.circleId == null || circleIds.has(p.circleId), `${at}: unknown circle`);
  check(['problem', 'discussion'].includes(p.kind), `${at}: unknown kind`);
  check((p.title ?? '').trim().length >= 8 && p.title.trim().length <= 160, `${at}: title must be 8–160 chars`);
  check((p.bodyMd ?? '').length <= 10000, `${at}: body ≤ 10 000 chars`);
  check((p.code ?? '').length <= 20000, `${at}: code ≤ 20 000 chars`);
  check(p.language == null || p.language === '' || /^[A-Za-z0-9+#._-]{1,32}$/.test(p.language), `${at}: bad language`);
  check(reproOk(p.repro), `${at}: repro must be { html, css, js } ≤ 60 000 bytes`);
  check(Array.isArray(p.tags) && p.tags.length >= 1 && p.tags.length <= 5 && new Set(p.tags).size === p.tags.length, `${at}: needs 1–5 distinct tags`);
  for (const t of p.tags ?? []) check(slugs.has(t), `${at}: unknown tag ${t}`);
  check(LEVELS.includes(p.difficulty), `${at}: unknown difficulty`);
  check((p.aiSummary ?? '').length <= 600, `${at}: aiSummary ≤ 600 chars`);
  check((p.aiHints ?? []).length <= 5 && (p.aiHints ?? []).join('').length <= 1500, `${at}: at most 5 hints, 1 500 chars in total`);
  check(['open', 'solved'].includes(p.status), `${at}: unknown status`);
  const accepted = (p.answers ?? []).filter((a) => a.isAccepted);
  check(accepted.length <= 1, `${at}: more than one accepted answer`);
  check((p.status === 'solved') === (accepted.length === 1), `${at}: status "solved" requires exactly one accepted answer (and the reverse)`);
  for (const a of p.answers ?? []) {
    check(userIds.has(a.authorId), `answer ${a.id}: unknown author`);
    check((a.bodyMd ?? '').trim().length >= 1 && a.bodyMd.length <= 10000, `answer ${a.id}: body must be 1–10 000 chars`);
    check(reproOk(a.repro), `answer ${a.id}: bad repro`);
  }
}
for (const m of messages) {
  check(circleIds.has(m.circleId), `message ${m.id}: unknown circle`);
  check(userIds.has(m.authorId), `message ${m.id}: unknown author`);
  check((m.body ?? '').trim().length >= 1 && m.body.length <= 1000, `message ${m.id}: body must be 1–1 000 chars`);
}
if (errors.length) {
  console.error(`seed.json is invalid (${errors.length} problem${errors.length > 1 ? 's' : ''}):`);
  for (const e of errors.slice(0, 40)) console.error(`  - ${e}`);
  process.exit(1);
}

// ---------------------------------------------------------------- generation
const allUserIds = users.map((u) => u.id);
const allPostIds = posts.map((p) => p.id);
const allAnswerIds = posts.flatMap((p) => (p.answers ?? []).map((a) => a.id));
const emailLocal = (u) => {
  const s = u.displayName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
  return s.length >= 2 ? s : u.handle;
};
const usedEmails = new Set();
const emails = new Map(users.map((u) => {
  let local = emailLocal(u);
  if (usedEmails.has(local)) local = `${local}.${u.handle}`;
  usedEmails.add(local);
  return [u.id, `${local}@${EMAIL_DOMAIN}`];
}));

const chunks = [];
const chunk = (title, statements) => chunks.push(
  `-- ${title}\nbegin;\n${statements.filter(Boolean).join('\n\n')}\ncommit;`);

// 1. users, profiles, interests, follows ----------------------------------------------
chunk('users, profiles, interests, follows', [
  `-- seed rows that are no longer in seed.json
delete from auth.users where raw_app_meta_data ->> 'seed' = 'true' and id not in (${uuidList(allUserIds)});
delete from public.posts where author_id in (${uuidList(allUserIds)}) and id not in (${uuidList(allPostIds)});
delete from public.answers where author_id in (${uuidList(allUserIds)}) and id not in (${uuidList(allAnswerIds)});
delete from public.messages where author_id in (${uuidList(allUserIds)}) and id not in (${uuidList(messages.map((m) => m.id))});`,

  interests.length && `insert into public.interests (id, slug, label_fr, label_en) values
${values(interests.map((i) => [int(i.id), str(i.slug), str(i.labelFr), str(i.labelEn)]))}
on conflict (id) do update set slug = excluded.slug, label_fr = excluded.label_fr, label_en = excluded.label_en;`,

  users.length && `-- a real member may have taken a seed handle or e-mail: move them out of the way
update public.profiles set handle = 'u_' || substr(replace(id::text, '-', ''), 1, 20)
where handle::text in (${users.map((u) => str(u.handle)).join(', ')}) and id not in (${uuidList(allUserIds)});

-- unusable random passwords: nobody can sign in as a seed user
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, is_anonymous) values
${values(users.map((u, i) => [
    `'00000000-0000-0000-0000-000000000000'::uuid`, uuid(u.id), `'authenticated'`, `'authenticated'`,
    str(emails.get(u.id)),
    `extensions.crypt(gen_random_uuid()::text || gen_random_uuid()::text, extensions.gen_salt('bf'))`,
    ago(30 + i * 3, 'days'),
    json({ provider: 'email', providers: ['email'], seed: true }),
    json({ display_name: u.displayName }),
    ago(30 + i * 3, 'days'), 'now()', `''`, `''`, `''`, `''`, 'false']))}
on conflict (id) do update set email = excluded.email, raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data, updated_at = now();

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at) values
${values(users.map((u) => [
    str(u.id.toLowerCase()), uuid(u.id),
    json({ sub: u.id.toLowerCase(), email: emails.get(u.id), email_verified: true, phone_verified: false }),
    `'email'`, 'now()', 'now()']))}
on conflict (provider_id, provider) do update set identity_data = excluded.identity_data, updated_at = now();

-- the auth trigger created a default profile; set the real one
insert into public.profiles (id, handle, display_name, avatar_url, bio, level, github_login, locale,
  is_guest, onboarded, reputation, created_at) values
${values(users.map((u, i) => [
    uuid(u.id), str(u.handle), str(u.displayName), str(u.avatarUrl ?? null), str(u.bio ?? ''),
    `${str(u.level)}::public.level_t`, str(u.githubLogin ?? null), `'fr'`, 'false', 'true',
    int(u.reputation), ago(30 + i * 3, 'days')]))}
on conflict (id) do update set handle = excluded.handle, display_name = excluded.display_name,
  avatar_url = excluded.avatar_url, bio = excluded.bio, level = excluded.level,
  github_login = excluded.github_login, is_guest = false, onboarded = true,
  reputation = excluded.reputation, created_at = excluded.created_at;

delete from public.user_interests where user_id in (${uuidList(allUserIds)});`,

  users.some((u) => (u.interests ?? []).length) && `insert into public.user_interests (user_id, interest_id, weight, muted, source, base_weight, updated_at)
select v.user_id, i.id, v.weight, false, 'onboarding', v.weight, now()
from (values
${values(users.flatMap((u) => (u.interests ?? []).map((x) => [uuid(u.id), str(x.slug), `${num(x.weight)}::real`])))}
) as v (user_id, slug, weight) join public.interests i on i.slug = v.slug
on conflict (user_id, interest_id) do update set weight = excluded.weight, base_weight = excluded.base_weight, updated_at = now();`,

  `delete from public.follows where follower_id in (${uuidList(allUserIds)}) and followee_id in (${uuidList(allUserIds)});`,
  follows.length && `insert into public.follows (follower_id, followee_id, created_at) values
${values(follows.map((f, i) => [uuid(f.followerId), uuid(f.followeeId), ago(1 + (i % 20), 'days')]))}
on conflict do nothing;`,
]);

// 2. circles ----------------------------------------------------------------------------
chunk('circles and members', [
  circles.length && `insert into public.circles (id, slug, name, description_fr, description_en, interest_id, external_invite_url, created_at) values
${values(circles.map((c, i) => [
    uuid(c.id), str(c.slug), str(c.name), str(c.descriptionFr ?? ''), str(c.descriptionEn ?? ''),
    c.interestSlug ? `(select id from public.interests where slug = ${str(c.interestSlug)})` : 'null',
    str(c.externalInviteUrl ?? null), ago(60 + i, 'days')]))}
on conflict (id) do update set slug = excluded.slug, name = excluded.name, description_fr = excluded.description_fr,
  description_en = excluded.description_en, interest_id = excluded.interest_id,
  external_invite_url = excluded.external_invite_url;`,

  `delete from public.circle_members where user_id in (${uuidList(allUserIds)});`,
  circles.some((c) => (c.memberIds ?? []).length) && `insert into public.circle_members (circle_id, user_id, joined_at) values
${values(circles.flatMap((c) => [...new Set(c.memberIds ?? [])].map((m, i) => [uuid(c.id), uuid(m), ago(2 + (i % 25), 'days')])))}
on conflict do nothing;`,
]);

// 3. posts with their tags and answers --------------------------------------------------
for (let start = 0; start < posts.length; start += POSTS_PER_CHUNK) {
  const batch = posts.slice(start, start + POSTS_PER_CHUNK);
  const ids = batch.map((p) => p.id);
  const answers = batch.flatMap((p) => (p.answers ?? []).map((a) => ({ ...a, postId: p.id })));
  const accepted = answers.filter((a) => a.isAccepted);
  chunk(`posts ${start + 1}–${start + batch.length} of ${posts.length}`, [
    `insert into public.posts (id, author_id, circle_id, kind, title, body_md, code, language, repro, difficulty,
  ai_summary, ai_hints, status, helpful_count, view_count, created_at, updated_at) values
${values(batch.map((p) => [
      uuid(p.id), uuid(p.authorId), uuid(p.circleId ?? null), str(p.kind), str(p.title.trim()), str(p.bodyMd ?? ''),
      str(p.code || null), str(p.language || null), json(p.repro ?? null), `${str(p.difficulty)}::public.level_t`,
      str(p.aiSummary || null), textArray(p.aiHints), str(p.status), int(p.helpfulCount), int(p.viewCount),
      ago(p.hoursAgo ?? 0, 'hours'), ago(p.hoursAgo ?? 0, 'hours')]))}
on conflict (id) do update set author_id = excluded.author_id, circle_id = excluded.circle_id, kind = excluded.kind,
  title = excluded.title, body_md = excluded.body_md, code = excluded.code, language = excluded.language,
  repro = excluded.repro, difficulty = excluded.difficulty, ai_summary = excluded.ai_summary,
  ai_hints = excluded.ai_hints, status = excluded.status,
  view_count = greatest(public.posts.view_count, excluded.view_count), created_at = excluded.created_at;

delete from public.post_tags where post_id in (${uuidList(ids)});
insert into public.post_tags (post_id, interest_id)
select v.post_id, i.id from (values
${values(batch.flatMap((p) => p.tags.map((t) => [uuid(p.id), str(t)])))}
) as v (post_id, slug) join public.interests i on i.slug = v.slug;`,

    answers.length && `insert into public.answers (id, post_id, author_id, body_md, repro, is_ai, is_accepted, accepted_at, helpful_count, created_at) values
${values(answers.map((a) => [
      uuid(a.id), uuid(a.postId), uuid(a.authorId), str(a.bodyMd.trim()), json(a.repro ?? null), bool(a.isAi),
      bool(a.isAccepted), a.isAccepted ? ago(a.hoursAgo ?? 0, 'hours') : 'null', int(a.helpfulCount),
      ago(a.hoursAgo ?? 0, 'hours')]))}
on conflict (id) do update set post_id = excluded.post_id, author_id = excluded.author_id, body_md = excluded.body_md,
  repro = excluded.repro, is_ai = excluded.is_ai, is_accepted = excluded.is_accepted,
  accepted_at = excluded.accepted_at, created_at = excluded.created_at;`,

    `-- consistency: accepted answer, counters (seed value + votes cast by real members)
update public.posts set accepted_answer_id = null where id in (${uuidList(ids)});`,
    accepted.length && `update public.posts p set accepted_answer_id = v.answer_id, status = 'solved'
from (values
${values(accepted.map((a) => [uuid(a.postId), uuid(a.id)]))}
) as v (post_id, answer_id) where p.id = v.post_id;`,
    `update public.posts p set
  answer_count = (select count(*) from public.answers a where a.post_id = p.id),
  helpful_count = v.helpful + (select count(*) from public.votes x where x.target_type = 'post' and x.target_id = p.id)
from (values
${values(batch.map((p) => [uuid(p.id), int(p.helpfulCount)]))}
) as v (id, helpful) where p.id = v.id;`,
    answers.length && `update public.answers a set
  helpful_count = v.helpful + (select count(*) from public.votes x where x.target_type = 'answer' and x.target_id = a.id)
from (values
${values(answers.map((a) => [uuid(a.id), int(a.helpfulCount)]))}
) as v (id, helpful) where a.id = v.id;`,
  ]);
}

// 4. messages and final fix-ups ------------------------------------------------------------
chunk('messages and final fix-ups', [
  messages.length && `insert into public.messages (id, circle_id, author_id, body, created_at) values
${values(messages.map((m) => [uuid(m.id), uuid(m.circleId), uuid(m.authorId), str(m.body.trim()), ago(m.minutesAgo ?? 0, 'minutes')]))}
on conflict (id) do update set circle_id = excluded.circle_id, author_id = excluded.author_id,
  body = excluded.body, created_at = excluded.created_at;`,

  users.length && `-- reputation is the seed's (the accept trigger may have moved it while upserting)
update public.profiles p set reputation = v.reputation
from (values
${values(users.map((u) => [uuid(u.id), int(u.reputation)]))}
) as v (id, reputation) where p.id = v.id;`,
]);

const header = `-- devloop demo content — GENERATED by scripts/seed.mjs from ${flag('in', 'seed/seed.json')}. Do not edit.
-- ${users.length} users, ${circles.length} circles, ${posts.length} posts, ${allAnswerIds.length} answers, ${messages.length} messages.
-- Idempotent; run as an admin role (no JWT).`;
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${header}\n\n${chunks.join('\n\n-- @@chunk\n\n')}\n`);
console.log(`wrote ${outPath}: ${chunks.length} chunks, ${users.length} users, ${posts.length} posts, ${allAnswerIds.length} answers, ${messages.length} messages`);
