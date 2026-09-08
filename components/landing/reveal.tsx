'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Fades and lifts its children into place the first time they scroll into
 * view, then leaves them alone — it doesn't replay on every pass, which is
 * what makes a reveal read as "subtle" rather than "gimmicky."
 *
 * Respects prefers-reduced-motion by skipping the hidden state entirely,
 * not just shortening the transition — a reduced-motion visitor should
 * never see content pop in as they scroll.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  /** Stagger, in ms — for revealing a grid of cards in sequence. */
  delay?: number;
  className?: string;
  as?: 'div' | 'li';
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Comp = Tag as any;
  return (
    <Comp
      ref={ref}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
      className={cn(
        'transition-[opacity,transform] duration-700 ease-out',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
        className,
      )}
    >
      {children}
    </Comp>
  );
}
