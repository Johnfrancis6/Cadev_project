/**
 * Picks the data-layer implementation and exports it as `api`.
 *
 * - No `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` → the in-browser implementation (`./local`).
 * - Both set → the Supabase implementation (`./supabase`), loaded on demand so the SDK never
 *   weighs on local mode. If it cannot be loaded or the backend does not answer at start-up,
 *   the app falls back to local mode and `apiInfo.fellBack` is true (the shell shows a banner).
 *
 * `api` is a stable facade: import it anywhere. It answers from local data straight away;
 * `initApi()` (awaited by src/main.tsx before rendering) switches it to the live backend
 * when one is configured and reachable.
 *
 * Contract for `src/lib/api/supabase/index.ts` (either export works):
 *   export function createSupabaseApi(url: string, anonKey: string): Api | Promise<Api>
 *   export const supabaseApi: Api
 */
import type { Api } from './contract';
import { localApi } from './local';

export * from './contract';
export { qk } from './keys';

const SUPABASE_URL: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY;
const live = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** How long the live backend gets to answer the start-up health check. */
const LIVE_PROBE_TIMEOUT_MS = 4000;

export const apiInfo = {
  /** Supabase credentials are present in the build. */
  liveConfigured: live,
  /** Live mode was requested but the app is running on local data. */
  fellBack: false,
};

type SupabaseModule = {
  createSupabaseApi?: (url: string, anonKey: string) => Api | Promise<Api>;
  supabaseApi?: Api;
};

// Resolved at build time: an empty object until `./supabase/index.ts` exists, so the build
// passes before the Supabase implementation lands and picks it up automatically afterwards.
const supabaseModules = import.meta.glob<SupabaseModule>('./supabase/index.ts');

/** Local data until (and unless) `initApi()` switches to the live backend. */
let impl: Api = localApi;
let initPromise: Promise<Api> | null = null;

async function loadLive(): Promise<Api | null> {
  const loader = supabaseModules['./supabase/index.ts'];
  if (!loader || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const mod = await loader();
    const candidate = mod.createSupabaseApi
      ? await mod.createSupabaseApi(SUPABASE_URL, SUPABASE_ANON_KEY)
      : (mod.supabaseApi ?? null);
    if (!candidate) return null;
    const health = await Promise.race([
      candidate.status.health(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LIVE_PROBE_TIMEOUT_MS)),
    ]);
    if (!health || health.database === 'down') return null;
    return candidate;
  } catch {
    return null;
  }
}

/** Loads the implementation once. Safe to call several times. */
export function initApi(): Promise<Api> {
  initPromise ??= (async () => {
    if (live) {
      const chosen = await loadLive();
      apiInfo.fellBack = chosen === null;
      if (chosen) impl = chosen;
    }
    return impl;
  })();
  return initPromise;
}

export const api: Api = new Proxy({} as Api, {
  get: (_target, key) => Reflect.get(impl, key),
  has: (_target, key) => Reflect.has(impl, key),
});
