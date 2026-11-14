import * as React from 'react';

const SUFFIX = 'devloop';
let base: string | null = null;
const overrides: { id: symbol; title: string }[] = [];

function render() {
  const title = overrides[overrides.length - 1]?.title ?? base;
  document.title = title ? `${title} · ${SUFFIX}` : `${SUFFIX} — Moins de bruit. Plus de code.`;
}

/** Route default (set by the router shell from the route handle). */
export function setBaseTitle(title: string | null): void {
  base = title;
  render();
}

/**
 * Sets the document title for the current page; restores the route default on unmount.
 * Pass `null`/`undefined` while data is loading to keep the route default.
 *
 *   usePageTitle(post?.title);
 */
export function usePageTitle(title: string | null | undefined): void {
  React.useEffect(() => {
    if (!title) return;
    const entry = { id: Symbol('title'), title };
    overrides.push(entry);
    render();
    return () => {
      const index = overrides.indexOf(entry);
      if (index >= 0) overrides.splice(index, 1);
      render();
    };
  }, [title]);
}
