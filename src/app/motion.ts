/**
 * Motion presets shared by every feature (import from '@/app/motion').
 *
 * The whole app is wrapped in <MotionConfig reducedMotion="user">, so transforms and layout
 * animations are already dropped under `prefers-reduced-motion`. `useMotionPresets()` goes one
 * step further and returns presets with no movement at all (opacity only, instant stagger).
 *
 *   const m = useMotionPresets();
 *   <motion.ul {...m.list}>                       // staggered container
 *     <motion.li variants={m.item} />             // each child fades/slides in
 *   </motion.ul>
 *   <motion.div {...m.fadeUp} />                  // single element entrance
 *   <motion.article {...m.cardHover} />           // subtle hover lift
 *   <motion.span layoutId="x" transition={m.layout} />   // shared-layout indicator
 */
import { useReducedMotion, type Transition, type Variants } from 'motion/react';

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const durations = { fast: 0.15, base: 0.2, slow: 0.25 } as const;

export const transitions = {
  fast: { duration: durations.fast, ease: EASE_OUT },
  base: { duration: durations.base, ease: EASE_OUT },
  slow: { duration: durations.slow, ease: EASE_OUT },
  /** Shared-layout indicators (tabs, nav pill). */
  layout: { duration: 0.22, ease: EASE_OUT },
} satisfies Record<string, Transition>;

const listVariants = (stagger: number): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: 0.02 } },
});

const itemVariants = (y: number): Variants => ({
  hidden: { opacity: 0, y },
  show: { opacity: 1, y: 0, transition: transitions.slow },
});

export interface MotionPresets {
  reduced: boolean;
  /** Spread on a motion container: children with `variants={item}` enter one after the other. */
  list: { variants: Variants; initial: 'hidden'; animate: 'show' };
  /** Variants for the children of `list`. */
  item: Variants;
  /** Spread on a single element: fade + 8 px slide up. */
  fadeUp: { initial: { opacity: number; y: number }; animate: { opacity: number; y: number }; transition: Transition };
  /** Spread on a single element: fade only. */
  fade: { initial: { opacity: number }; animate: { opacity: number }; exit: { opacity: number }; transition: Transition };
  /** Spread on overlays/popins: fade + slight scale. */
  pop: {
    initial: { opacity: number; scale: number };
    animate: { opacity: number; scale: number };
    exit: { opacity: number; scale: number };
    transition: Transition;
  };
  /** Spread on a card: 2 px hover lift, small press. */
  cardHover: { whileHover?: { y: number }; whileTap?: { scale: number }; transition: Transition };
  /** Transition for `layoutId` elements. */
  layout: Transition;
  transitions: typeof transitions;
}

const full: MotionPresets = {
  reduced: false,
  list: { variants: listVariants(0.045), initial: 'hidden', animate: 'show' },
  item: itemVariants(10),
  fadeUp: { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: transitions.slow },
  fade: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: transitions.base },
  pop: {
    initial: { opacity: 0, scale: 0.97 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.97 },
    transition: transitions.fast,
  },
  cardHover: { whileHover: { y: -2 }, whileTap: { scale: 0.995 }, transition: transitions.fast },
  layout: transitions.layout,
  transitions,
};

const instant: Transition = { duration: 0 };

const reducedPresets: MotionPresets = {
  reduced: true,
  list: { variants: listVariants(0), initial: 'hidden', animate: 'show' },
  item: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.01 } } },
  fadeUp: { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 }, transition: instant },
  fade: { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: instant },
  pop: { initial: { opacity: 1, scale: 1 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 1 }, transition: instant },
  cardHover: { transition: instant },
  layout: instant,
  transitions,
};

export const motionPresets = { full, reduced: reducedPresets };

/** Presets that respect the user's reduced-motion setting. */
export function useMotionPresets(): MotionPresets {
  return useReducedMotion() ? reducedPresets : full;
}

export { useReducedMotion };
