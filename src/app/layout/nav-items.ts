import { Bookmark, LayoutGrid, Search, Users, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  /** Key in the `common` namespace. */
  labelKey: string;
  icon: LucideIcon;
  /** Extra path prefixes that keep the item active. */
  match?: string[];
}

export const MAIN_NAV: NavItem[] = [
  { to: '/feed', labelKey: 'nav.feed', icon: LayoutGrid, match: ['/p/'] },
  { to: '/circles', labelKey: 'nav.circles', icon: Users, match: ['/c/'] },
  { to: '/search', labelKey: 'nav.search', icon: Search },
  { to: '/saved', labelKey: 'nav.saved', icon: Bookmark },
];

export function isActive(item: Pick<NavItem, 'to' | 'match'>, pathname: string): boolean {
  if (pathname === item.to || pathname.startsWith(`${item.to}/`)) return true;
  return (item.match ?? []).some((prefix) => pathname.startsWith(prefix));
}

/** Fired by the search trigger and ⌘K. A listener that opens a palette must call `preventDefault()`. */
export const OPEN_SEARCH_EVENT = 'devloop:open-search';
