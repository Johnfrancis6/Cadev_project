# devloop — build spec

Shared reference for everyone working on the codebase. `src/lib/api/contract.ts` is the
data contract; this file is everything around it. If the two disagree, the contract wins.

## 1. Product in one paragraph

devloop is a social network where developers **post problems and get unblocked**. The feed
optimises *problems unblocked*, not time spent: it is **explainable** ("why am I seeing
this?") and **steerable** (sliders, "less of this"). While typing a problem the app shows
**similar problems that are already solved**. A problem can carry a **runnable repro**
that answers can **fork and fix**. AI **triage** proposes tags, difficulty, a summary and
"try this first" hints, always labelled as AI and never applied without the author.
Interests can be pre-filled from a **GitHub username**.

Judged on: quality, presentation, innovation, reliability, accessibility. A jury member
has ~3 minutes and must see the value in the first 60 seconds, on a phone or a laptop.

## 2. Stack

| Layer | Choice |
|---|---|
| App | Vite, React 19, TypeScript strict, React Router (library mode), TanStack Query v5 |
| UI | Tailwind CSS v4, shadcn/ui (Radix), lucide-react, `motion` (Framer Motion), sonner, cmdk |
| Content | react-markdown + remark-gfm + rehype-sanitize (no raw HTML), prism-react-renderer |
| i18n | i18next + react-i18next, French default, English toggle |
| Backend | Supabase: Auth (email, GitHub, anonymous), Postgres + RLS, Realtime, pgvector, Edge Functions (Deno) |
| AI | Edge Function `ai`: Groq → Mistral → Cerebras → OpenRouter → local heuristic; embeddings with the built-in `gte-small` (384 d) |
| Hosting | Cloudflare Pages (static `dist/`, `_headers` for CSP, `_redirects` for SPA fallback) |
| Tests | Vitest (pure logic), Playwright (smoke on the built app) |

No paid service, no credit card, no secret in the browser bundle.

## 3. Folder ownership

One owner per folder. Do not edit files outside your folders; if you need a change
elsewhere, say so in your final report.

```
prototype/                 read-only design reference (original HTML/CSS/JS)
docs/                      spec, reference screenshots
seed/seed.json             demo content (single source for local mode and Supabase)
supabase/migrations/*.sql  schema, RLS, RPCs
supabase/functions/ai/     AI gateway edge function
scripts/                   seed + deploy helpers (Node, no extra deps)
src/app/                   providers, router, layout shell, theme, i18n bootstrap
src/components/ui/         shadcn primitives
src/components/shared/     PostCard, Markdown, CodeBlock, UserAvatar, TagChip, LevelBadge, EmptyState, …
src/lib/api/contract.ts    the contract
src/lib/api/index.ts       picks the implementation (exports `api`)
src/lib/api/local/         in-browser implementation backed by seed.json + localStorage
src/lib/api/supabase/      Supabase implementation
src/features/<name>/       pages, components, hooks, locales/{fr,en}.json for one feature
```

`package.json` and dependency installs belong to the foundation owner only. Nobody but the
lead runs `git commit`.

## 4. Routes

| Path | Feature folder | Access |
|---|---|---|
| `/` | `landing` | public; signed-in users are sent to `/feed` |
| `/auth` | `auth` | public |
| `/onboarding` | `onboarding` | signed in, not onboarded |
| `/feed` | `feed` | signed in |
| `/p/new`, `/p/:id` | `problems` | signed in |
| `/circles`, `/c/:slug` | `circles` | signed in |
| `/search` | `search` (also the ⌘K palette) | signed in |
| `/u/:handle`, `/saved`, `/settings` | `profile` | signed in |
| `/status` | `status` | public |

Each feature exports its pages from `src/features/<name>/pages/<Name>Page.tsx` (default
export). The router lazy-loads them.

## 5. Local mode and live mode

`src/lib/api/index.ts` exports `api`. When `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are set it is the Supabase implementation; otherwise the local
one. If the live backend is unreachable at start-up the app falls back to local mode and
shows a discreet banner. Local mode is fully functional (auth is simulated, data lives in
`localStorage`, chat echoes scripted replies, AI uses the heuristic) so the product can
always be demonstrated.

## 6. Data model (Postgres, schema `public`)

```
profiles(id uuid pk → auth.users on delete cascade, handle citext unique, display_name, avatar_url,
         bio, level level_t default 'intermediate', github_login, locale default 'fr',
         is_guest bool, onboarded bool default false, reputation int default 0, created_at)
interests(id smallint pk, slug unique, label_fr, label_en)
user_interests(user_id, interest_id, weight real 0..1, muted bool, source, base_weight real, updated_at, pk(user_id, interest_id))
follows(follower_id, followee_id, created_at, pk)
circles(id uuid pk, slug unique, name, description_fr, description_en, interest_id, external_invite_url, created_at)
circle_members(circle_id, user_id, joined_at, pk)
posts(id uuid pk, author_id, circle_id null, kind, title, body_md, code, language, repro jsonb,
      difficulty level_t, ai_summary, ai_hints text[], status default 'open', accepted_answer_id,
      embedding vector(384), fts tsvector, helpful_count, answer_count, view_count, created_at, updated_at)
post_tags(post_id, interest_id, pk)
answers(id uuid pk, post_id, author_id, body_md, repro jsonb, is_ai, is_accepted, helpful_count, created_at)
votes(user_id, target_type 'post'|'answer', target_id, created_at, pk)
saves(user_id, post_id, created_at, pk)
events(id bigint, user_id, post_id, type, value, created_at)
messages(id uuid pk, circle_id, author_id, body, created_at)
notifications(id uuid pk, user_id, type, actor_id, post_id, read bool, created_at)
reports(id, reporter_id, target_type, target_id, reason, created_at)
ai_cache(hash pk, task, response jsonb, provider, created_at)
ai_usage(user_id, day date, calls int, pk(user_id, day))
```

Limits enforced in the database (check constraints): title 8–160 chars, body ≤ 10 000,
code ≤ 20 000, repro ≤ 60 000 bytes, answer ≤ 10 000, message 1–1 000, bio ≤ 280,
handle `^[a-z0-9_]{3,24}$`, 1–5 tags per post.

Rate limits enforced by triggers (raise `rate_limited`): 10 posts/hour, 30 answers/hour,
20 chat messages/minute, 20 AI calls/day per user (guests: 8).

### RLS (every table has RLS on)

- Read: `profiles`, `interests`, `circles`, `circle_members`, `posts`, `post_tags`,
  `answers`, `messages`, `follows` are readable by any authenticated user (guests
  included). Vote counts are public through the counters; `votes`, `saves`, `events`,
  `user_interests`, `notifications`, `ai_usage` are readable only by their owner.
- Write: only the owner of a row can insert/update/delete it. `status`,
  `accepted_answer_id`, counters, `reputation`, `is_accepted`, `embedding` are never
  writable directly — only through security-definer RPCs/triggers.
- `ai_cache`, `reports` (read), and all seed/admin operations: service role only.
- Guests can read everything, vote, save, chat and post like any member (the jury must be
  able to try the whole loop); the stricter guest AI budget is the only difference.

### RPCs (all `security invoker` unless noted; return `jsonb` shaped like the contract types)

| RPC | Purpose |
|---|---|
| `feed_for_user(p_tab, p_limit, p_offset, p_interest)` | ranked posts with `score` and `reasons` |
| `record_event(p_post_id, p_type, p_value)` | definer; stores the event and updates `user_interests` |
| `match_posts(p_embedding vector(384), p_limit, p_min_sim)` | semantic neighbours, solved first |
| `search_posts(p_query, p_limit, p_status)` | FTS (`simple` + unaccent, title > tags > body) with trigram fallback |
| `accept_answer(p_answer_id)` | definer; only the post author; toggles; sets status; reputation +15 |
| `set_helpful(p_target_type, p_target_id, p_on)` | definer; maintains counters; reputation +2 |
| `complete_onboarding(p_level, p_slugs, p_display_name)` | sets profile + base interest weights 0.6 |
| `profile_stats(p_user_id)`, `platform_stats()` | counters for profile and landing |
| `get_post(p_id)`, `list_answers(p_post_id)`, `circle_posts(p_slug, p_limit, p_offset)`, `user_posts(...)`, `saved_posts(...)` | reads shaped like the contract |

### Feed scoring

```
score = 3.0 * Σ weight(tag)            -- viewer's effective interest weights, muted tags excluded entirely
      + 1.5 * exp(-age_hours / 72)
      + 0.8 * ln(1 + helpful_count + 2 * (status = 'solved')::int)
      + 1.0 * level_match               -- 1 same level, 0.5 adjacent, 0 otherwise
      + 0.6 * (author followed)::int
```

Effective weight = `weight * 0.98 ^ days_since(updated_at)`. Every 8th slot (≈ 12 %) is
an **exploration** slot: the best post among topics where the viewer's weight is < 0.15.
The viewer's own posts are excluded. Tabs: `for-you` (score), `following` (followed
authors, newest), `unanswered` (open problems with no answer, hardest matching level
first), `latest` (newest).

Learning — `record_event` applies, for each tag of the post,
`w ← clamp01(w + gain * (1 - w))` with gains: impression 0, open 0.08, dwell (≥ 10 s) 0.08,
expand_code 0.05, copy_code 0.10, run_repro 0.10, helpful 0.12, save 0.12, answer 0.20,
accept 0.20. `less` halves the weight. Rows are created on first signal with
`source = 'behavior'`. `resetLearning` restores `base_weight` and deletes behaviour-only rows.

Reasons (max 2 per card, in this priority): `following`, `interest` (top matching tag with
weight ≥ 0.15, with `count` = recent opens on that tag), `explore`, `trending` (most active
post of its circle over 48 h), `level`, `unanswered`, `fresh` (< 6 h).

## 7. Edge function `ai`

`POST /functions/v1/ai` with the user's JWT. Body `{ "task": ..., ... }`.

| task | body | response |
|---|---|---|
| `triage` | `title, bodyMd, code?, language?, locale` | `TriageResult` |
| `draft` | `postId, locale` | `DraftResult` |
| `similar` | `text, limit?` | `{ posts: Post[], mode: 'semantic' \| 'keyword' }` |
| `embed_post` | `postId` (author only) | `{ ok: true }` — stores the embedding |
| `health` | — | provider states for `/status` (no auth needed) |

Rules: input capped (title 160, body 4 000, code 4 000 chars); strict JSON output validated
and retried once; results cached in `ai_cache` by SHA-256 of task + normalised input;
per-user daily budget in `ai_usage`; provider order from the secrets that exist
(`GROQ_API_KEY`, `MISTRAL_API_KEY`, `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY`), honouring
`Retry-After`; `AI_DISABLED=1` kill switch; when nothing answers, return the deterministic
heuristic result with `degraded: true` — never an error. Tags are restricted to existing
interest slugs. Prompts answer in the requested locale.

## 8. Security checklist

- RLS on every table, no service key outside the edge function, anon key only in the bundle.
- All markdown rendered through rehype-sanitize; links get `rel="nofollow noopener noreferrer"` and `target="_blank"`; only `http(s)` URLs.
- User code runs only inside `<iframe sandbox="allow-scripts">` built from `srcdoc`, never
  `allow-same-origin`; the parent talks to it through `postMessage` and checks `event.source`.
- Strict CSP and security headers in `public/_headers` (no inline scripts in the app shell).
- Passwords ≥ 8 chars, validated client and server side; generic auth error messages.
- Rate limits in the database; AI budget; report button on posts, answers and messages.

## 9. Design direction

Keep the devloop identity from `prototype/` and take it to a premium SaaS level:
near-black olive background `#111310`, panels `#1a1d17`, hairline borders `#2c3027`,
lime accent `#d0f68a` used sparingly (one accent element per view region), **DM Sans**
for text and **JetBrains Mono** for code, labels and numbers (fonts are in
`prototype/assets/`, self-host them). Add a **light theme** with the same character
(warm off-white, deep olive text, a darker green accent that passes contrast).

- Calm and airy: generous spacing, 12–16 px radii, hairlines rather than shadows, one
  soft glow at most. No gradient text, no glassmorphism everywhere, no emoji as icons.
- Motion: short (150–250 ms) ease-out transitions, staggered fade/slide-in for lists,
  shared-layout tab indicator, subtle hover lift on cards, number count-up on stats.
  Everything honours `prefers-reduced-motion`.
- Accessibility (WCAG 2.1 AA): contrast ≥ 4.5:1 for text in both themes, visible focus
  ring, full keyboard navigation, skip link, semantic landmarks and headings, labelled
  controls, `aria-live` for toasts and chat, touch targets ≥ 44 px, `lang` kept in sync
  with the UI language.
- Mobile first: bottom tab bar on phones, sidebar from `lg`, right rail from `xl`.
- Copy: short, concrete, sentence case, same word for the same thing everywhere
  ("problème / problem", "réponse / answer", "cercle / circle", "utile / helpful").

## 10. Environment variables

Browser (public): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
Edge function secrets: `GROQ_API_KEY` (others optional), `AI_DISABLED`.
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to the function by Supabase.

## 11. Seed content (`seed/seed.json`)

Single source for local mode and for the Supabase seed. Explicit, stable uuids everywhere.

```
{
  "interests": [{ "id": 1, "slug": "javascript", "labelFr": "JavaScript", "labelEn": "JavaScript" }],
  "users":    [{ "id": uuid, "handle", "displayName", "avatarUrl": "/avatars/sarah.jpg" | null, "level", "bio",
                 "githubLogin": string | null, "reputation": number,
                 "interests": [{ "slug", "weight" }] }],
  "follows":  [{ "followerId": uuid, "followeeId": uuid }],
  "circles":  [{ "id": uuid, "slug", "name", "descriptionFr", "descriptionEn", "interestSlug",
                 "externalInviteUrl": string | null, "memberIds": [uuid] }],
  "posts":    [{ "id": uuid, "authorId", "circleId": uuid | null, "kind", "title", "bodyMd", "code", "language",
                 "repro": { "html", "css", "js" } | null, "tags": [slug], "difficulty", "aiSummary", "aiHints": [string],
                 "status", "hoursAgo": number, "helpfulCount": number, "viewCount": number,
                 "answers": [{ "id": uuid, "authorId", "bodyMd", "repro": … | null, "isAi", "isAccepted",
                               "hoursAgo": number, "helpfulCount": number }] }],
  "messages": [{ "id": uuid, "circleId", "authorId", "body", "minutesAgo": number }]
}
```

Timestamps are relative (`hoursAgo`, `minutesAgo`) and resolved when the seed is loaded so
the demo always looks alive. Interests (ids 1–18, fixed): javascript, typescript, react,
nodejs, python, django, data-ai, databases, devops, mobile, css, git, security, testing,
career, java, php, go. Portraits available: `/avatars/{alex,amine,idrissa,julie,lea,sarah,yann}.jpg`.
