import * as TabsPrimitive from '@radix-ui/react-tabs';
import { motion } from 'motion/react';
import * as React from 'react';
import { cn } from '@/lib/utils';

type TabsVariant = 'underline' | 'pill';
const TabsContext = React.createContext<{ value: string | undefined; variant: TabsVariant; layoutId: string }>({
  value: undefined,
  variant: 'underline',
  layoutId: 'tabs',
});

export interface TabsProps extends React.ComponentProps<typeof TabsPrimitive.Root> {
  /** `underline` (feed tabs, default) or `pill` (segmented control). */
  variant?: TabsVariant;
}

/** Radix tabs with a shared-layout indicator that slides between triggers. */
export function Tabs({ className, variant = 'underline', value, defaultValue, onValueChange, ...props }: TabsProps) {
  const [inner, setInner] = React.useState(defaultValue);
  const current = value ?? inner;
  const layoutId = React.useId();
  return (
    <TabsContext.Provider value={{ value: current, variant, layoutId }}>
      <TabsPrimitive.Root
        data-slot="tabs"
        value={current}
        onValueChange={(next) => {
          setInner(next);
          onValueChange?.(next);
        }}
        className={cn('flex flex-col gap-4', className)}
        {...props}
      />
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  const { variant } = React.useContext(TabsContext);
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'flex items-center overflow-x-auto [scrollbar-width:none]',
        variant === 'underline' ? 'gap-6 border-b border-border' : 'w-fit gap-1 rounded-lg border border-border bg-surface-soft p-1',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, children, value, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const ctx = React.useContext(TabsContext);
  const active = ctx.value === value;
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      value={value}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center gap-2 text-sm whitespace-nowrap text-muted-foreground transition-colors duration-150 focus-ring',
        'hover:text-foreground data-[state=active]:font-medium data-[state=active]:text-foreground disabled:pointer-events-none disabled:opacity-50',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        ctx.variant === 'underline' ? 'min-h-11 rounded-sm py-3' : 'min-h-8 rounded-md px-3 py-1 touch:min-h-10',
        className,
      )}
      {...props}
    >
      {active && ctx.variant === 'pill' && (
        <motion.span
          layoutId={ctx.layoutId}
          aria-hidden="true"
          className="absolute inset-0 rounded-md border border-border bg-raised"
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
      {active && ctx.variant === 'underline' && (
        <motion.span
          layoutId={ctx.layoutId}
          aria-hidden="true"
          className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand"
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn('focus-ring rounded-md', className)} {...props} />;
}
