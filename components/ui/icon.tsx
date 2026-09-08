import { cn } from '@/lib/utils';

const sizes = {
  xs: 'text-[14px]',
  sm: 'text-[16px]',
  md: 'text-[20px]',
  lg: 'text-[24px]',
  xl: 'text-[32px]',
} as const;

export type IconSize = keyof typeof sizes;

export interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Material Symbols ligature name, e.g. "inventory_2", "local_shipping". */
  name: string;
  size?: IconSize;
  /** Solid rather than outlined — use for active/selected states. */
  filled?: boolean;
}

/**
 * Material Symbols icon. Decorative by default; pass an `aria-label` (and the
 * component will expose it to assistive tech) when the icon carries meaning
 * no adjacent text already provides.
 */
export function Icon({ name, size = 'md', filled = false, className, ...props }: IconProps) {
  const labelled = props['aria-label'] !== undefined;
  return (
    <span
      aria-hidden={labelled ? undefined : true}
      role={labelled ? 'img' : undefined}
      className={cn(
        'material-symbols-outlined select-none',
        filled && 'is-filled',
        sizes[size],
        className,
      )}
      {...props}
    >
      {name}
    </span>
  );
}
