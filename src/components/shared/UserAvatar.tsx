import * as React from 'react';
import type { Author } from '@/lib/api/contract';
import { cn, hashString, initials } from '@/lib/utils';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<AvatarSize, string> = {
  xs: 'size-5 text-[0.5625rem]',
  sm: 'size-7 text-[0.6875rem]',
  md: 'size-9 text-xs',
  lg: 'size-12 text-base',
  xl: 'size-20 text-2xl',
};

export interface UserAvatarProps {
  user: Pick<Author, 'displayName' | 'avatarUrl'> & { id?: string; handle?: string };
  size?: AvatarSize;
  className?: string;
  /** Decorative by default (the name is usually printed next to it). Pass true to expose the name as alt text. */
  labelled?: boolean;
}

/** Portrait, or deterministic initials on a generated tint when there is no image (or it fails to load). */
export function UserAvatar({ user, size = 'md', className, labelled = false }: UserAvatarProps) {
  const [failed, setFailed] = React.useState(false);
  const showImage = Boolean(user.avatarUrl) && !failed;
  const hue = hashString(user.id ?? user.handle ?? user.displayName) % 360;
  return (
    <span
      data-slot="user-avatar"
      className={cn('relative inline-flex shrink-0 overflow-hidden rounded-full bg-surface-hover select-none', SIZES[size], className)}
      {...(labelled ? { role: 'img', 'aria-label': user.displayName } : { 'aria-hidden': true })}
    >
      {showImage ? (
        <img
          src={user.avatarUrl ?? undefined}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <span
          className="flex size-full items-center justify-center font-semibold"
          // Fixed lightness/chroma keeps the pair above 7:1 whatever the hue.
          style={{ backgroundColor: `oklch(0.32 0.06 ${hue})`, color: `oklch(0.93 0.07 ${hue})` }}
        >
          {initials(user.displayName)}
        </span>
      )}
    </span>
  );
}
