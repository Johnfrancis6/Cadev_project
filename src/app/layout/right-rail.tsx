import * as React from 'react';
import { createPortal } from 'react-dom';

interface RailContextValue {
  node: HTMLElement | null;
  register: () => () => void;
}

export const RailContext = React.createContext<RailContextValue | null>(null);

/** Internal: state held by AppLayout. */
export function useRailState() {
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  const [count, setCount] = React.useState(0);
  const register = React.useCallback(() => {
    setCount((c) => c + 1);
    return () => setCount((c) => c - 1);
  }, []);
  const value = React.useMemo(() => ({ node, register }), [node, register]);
  return { value, setNode, active: count > 0 };
}

/**
 * Fills the app shell's right column (visible from the `xl` breakpoint, hidden below).
 * Render it anywhere inside a page; the column only exists while a <RightRail> is mounted.
 *
 *   <RightRail><TrendingCard /><SuggestionsCard /></RightRail>
 */
export function RightRail({ children }: { children: React.ReactNode }) {
  const ctx = React.useContext(RailContext);
  const register = ctx?.register;
  React.useEffect(() => register?.(), [register]);
  if (!ctx?.node) return null;
  return createPortal(children, ctx.node);
}
