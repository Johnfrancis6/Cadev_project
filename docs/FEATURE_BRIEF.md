# Brief commun aux blocs « pages » (feature engineers)

You are building one block of pages of **devloop** (competition entry judged tomorrow on quality,
presentation, innovation, reliability, accessibility). Several engineers work in this same
directory at the same time. Budget is tight: be efficient, read only what you need, no long
exploration, no web research unless blocked.

## Read first (in this order, skim fast)
1. `docs/SPEC.md` — product, routes, design direction (§9), security (§8).
2. `src/lib/api/contract.ts` — the ONLY way to reach data: `import { api, qk } from '@/lib/api'`.
3. Foundation surface: `src/components/shared/index.ts` (PostCard, ReasonChips, Markdown, CodeBlock,
   UserAvatar, LevelBadge, TagChip, StatusBadge, AiLabel, EmptyState, ErrorState, PageHeader,
   Section, StatNumber, RelativeTime, skeletons, usePostActions/patchPostInCache), `src/components/ui/*`
   (shadcn), `src/app/motion.ts` (`useMotionPresets`), `src/app/auth.tsx` (`useAuth`, `useProfile`),
   `src/app/layout/index.ts` (`RightRail`, `usePageTitle`, `useOpenSearch`), `src/app/i18n.ts`
   (`interestLabel`, `useLocale`, `errorMessage`), `src/lib/api/keys.ts` (`qk`), `src/styles/tokens.css`.
   `/dev/kitchen-sink` shows every component.

## Rules
- Own ONLY your `src/features/<name>/**` folders (listed in your task). Replace the stub pages
  (keep file names and default exports). Never edit package.json, src/app, src/components, src/lib,
  other features, supabase, scripts, seed, docs. Need a foundation change? Don't make it — report it.
- No new npm dependencies. No state-changing git commands (the lead commits).
- Data: TanStack Query with `qk` keys; mutations with optimistic updates where it feels instant;
  every query has loading (skeleton), empty (EmptyState) and error (ErrorState with retry) states.
  Errors are `ApiError` → toast with `errorMessage(e)` (sonner `toast`).
- i18n: every visible string through `useTranslation('<feature>')`, with complete
  `src/features/<name>/locales/fr.json` and `en.json` (French is the default; write natural,
  short, concrete copy — tutoiement in French, sentence case). Shared words live in `common`.
- Design: reuse tokens/utilities and existing components; calm, airy, premium; lime accent
  sparingly; light AND dark themes; mobile first (390 px) up to 1440 px. Motion via
  `useMotionPresets()` only (already reduced-motion aware).
- Accessibility (WCAG AA): one `<h1>` per page (PageHeader), labelled controls, keyboard operable,
  visible focus, `aria-live` for async results, no information by colour alone, targets ≥ 44 px on touch.
- Security: never `dangerouslySetInnerHTML`; user text only through `<Markdown>`; URLs through `safeUrl`.

## Verify before reporting
- `npm run typecheck` and `npm run lint` clean for your files; `npm run build` passes.
- Run the app (`npm run dev -- --port <your port>`) and drive it with Playwright (pre-installed:
  `require('playwright')`, `chromium.launch()`; never `playwright install`). The app runs on the
  in-browser data layer (`src/lib/api/local`, guest sign-in via `api.auth.signInGuest()` or the
  `/auth` page). If `src/lib/api/local/index.ts` does not exist yet when you start, build against
  the contract first and verify as soon as it appears (check again before finishing; if it never
  appears, say so). Screenshot each page at 390×844 and 1440×900, dark and light, LOOK at them,
  fix what is off. Scripts/screenshots go in
  `/tmp/claude-0/-home-user-Cadev-project/d4fa9072-f65a-5a6a-8083-0c6a6b750a4c/scratchpad/<feature>/`, not in the repo.
- No console errors.

## Final report (short)
What works (verified how), what is not done, any contract/foundation issue found, files touched.
