import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { api } from '@/lib/api';
import type { Profile } from '@/lib/api/contract';

export interface AuthContextValue {
  /** Signed-in profile, or null. */
  profile: Profile | null;
  /** True until the stored session has been restored. */
  loading: boolean;
  signOut: () => Promise<void>;
  /** Re-reads the profile from the data layer (after profile edits or onboarding). */
  refresh: () => Promise<Profile | null>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = React.useState<{ profile: Profile | null; loading: boolean }>({ profile: null, loading: true });
  const lastUserId = React.useRef<string | null | undefined>(undefined);

  const commit = React.useCallback(
    (profile: Profile | null) => {
      const id = profile?.id ?? null;
      // A different user (or sign-out): cached data belongs to someone else.
      if (lastUserId.current !== undefined && lastUserId.current !== id) queryClient.clear();
      lastUserId.current = id;
      setState({ profile, loading: false });
    },
    [queryClient],
  );

  React.useEffect(() => {
    let alive = true;
    api.auth
      .current()
      .then((profile) => alive && commit(profile))
      .catch(() => alive && commit(null));
    const unsubscribe = api.auth.onChange((profile) => alive && commit(profile));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [commit]);

  const signOut = React.useCallback(async () => {
    await api.auth.signOut();
    commit(null);
  }, [commit]);

  const refresh = React.useCallback(async () => {
    const profile = await api.auth.current();
    commit(profile);
    return profile;
  }, [commit]);

  const value = React.useMemo<AuthContextValue>(() => ({ ...state, signOut, refresh }), [state, signOut, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** The signed-in profile; throws when used outside a `RequireAuth` route. */
export function useProfile(): Profile {
  const { profile } = useAuth();
  if (!profile) throw new Error('useProfile used outside an authenticated route');
  return profile;
}
