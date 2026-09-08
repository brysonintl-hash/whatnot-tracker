'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // Condensed uppercase label is the signature of the language. Rest → hover
  // lifts a hair with more shadow; press drops it flat below rest — the
  // combination is what makes a click feel like it landed on something.
  // `group` lets an icon child (e.g. an arrow) react to the same hover via
  // group-hover:, so "Shop Deals →" nudges forward as one small gesture.
  'group inline-flex items-center justify-center gap-unit-xs whitespace-nowrap font-display uppercase tracking-wider ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container ' +
  'disabled:pointer-events-none disabled:opacity-40 ' +
  'hover:-translate-y-0.5 active:translate-y-px active:shadow-none active:duration-75',
  {
    variants: {
      variant: {
        primary:
          'bg-primary-container text-on-primary-container shadow-sm hover:bg-primary hover:shadow-md',
        secondary:
          'bg-surface-container-high text-on-surface hover:bg-surface-container-highest',
        outline:
          'border border-outline-variant bg-surface-container-lowest text-on-surface hover:border-primary-container hover:text-primary',
        ghost:
          'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
        danger:
          'bg-error text-on-error shadow-sm hover:brightness-110 hover:shadow-md',
        /** Inverted — for dark headers and hero bands. */
        inverse:
          'bg-inverse-surface text-inverse-on-surface hover:brightness-125',
      },
      size: {
        sm: 'h-8 px-unit-md text-[12px] leading-none tracking-[0.08em] rounded',
        md: 'h-10 px-unit-lg text-label-badge rounded',
        lg: 'h-12 px-unit-xl text-headline-sm rounded-lg',
        icon: 'h-10 w-10 rounded',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
