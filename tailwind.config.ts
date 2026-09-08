import type { Config } from 'tailwindcss';

/**
 * Stack Bargains design system.
 *
 * Colors resolve through CSS variables defined in app/globals.css, so every
 * token adapts to light/dark automatically — components write `bg-surface`,
 * not `bg-white dark:bg-slate-800`.
 *
 * Token names follow the imported design language (Material 3 naming) so
 * mockups authored against it can be dropped in with their markup intact.
 */
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // — Brand / primary
        primary: v('--primary'),
        'on-primary': v('--on-primary'),
        'primary-container': v('--primary-container'),
        'on-primary-container': v('--on-primary-container'),
        'primary-fixed': v('--primary-fixed'),
        'primary-fixed-dim': v('--primary-fixed-dim'),
        'on-primary-fixed': v('--on-primary-fixed'),
        'on-primary-fixed-variant': v('--on-primary-fixed-variant'),
        'inverse-primary': v('--inverse-primary'),

        // — Secondary
        secondary: v('--secondary'),
        'on-secondary': v('--on-secondary'),
        'secondary-container': v('--secondary-container'),
        'on-secondary-container': v('--on-secondary-container'),
        'secondary-fixed': v('--secondary-fixed'),
        'secondary-fixed-dim': v('--secondary-fixed-dim'),
        'on-secondary-fixed': v('--on-secondary-fixed'),
        'on-secondary-fixed-variant': v('--on-secondary-fixed-variant'),

        // — Tertiary
        tertiary: v('--tertiary'),
        'on-tertiary': v('--on-tertiary'),
        'tertiary-container': v('--tertiary-container'),
        'on-tertiary-container': v('--on-tertiary-container'),
        'tertiary-fixed': v('--tertiary-fixed'),
        'tertiary-fixed-dim': v('--tertiary-fixed-dim'),
        'on-tertiary-fixed': v('--on-tertiary-fixed'),
        'on-tertiary-fixed-variant': v('--on-tertiary-fixed-variant'),

        // — Surfaces
        background: v('--background'),
        'on-background': v('--on-background'),
        surface: v('--surface'),
        'on-surface': v('--on-surface'),
        'surface-variant': v('--surface-variant'),
        'on-surface-variant': v('--on-surface-variant'),
        'surface-tint': v('--surface-tint'),
        'surface-bright': v('--surface-bright'),
        'surface-dim': v('--surface-dim'),
        'surface-container-lowest': v('--surface-container-lowest'),
        'surface-container-low': v('--surface-container-low'),
        'surface-container': v('--surface-container'),
        'surface-container-high': v('--surface-container-high'),
        'surface-container-highest': v('--surface-container-highest'),
        'inverse-surface': v('--inverse-surface'),
        'inverse-on-surface': v('--inverse-on-surface'),

        // — Lines
        outline: v('--outline'),
        'outline-variant': v('--outline-variant'),

        // — Status. Not part of the imported palette, but the dashboard
        //   reports profit, margin and stock health, so it needs them.
        error: v('--error'),
        'on-error': v('--on-error'),
        'error-container': v('--error-container'),
        'on-error-container': v('--on-error-container'),
        success: v('--success'),
        'on-success': v('--on-success'),
        'success-container': v('--success-container'),
        'on-success-container': v('--on-success-container'),
        warning: v('--warning'),
        'on-warning': v('--on-warning'),
        'warning-container': v('--warning-container'),
        'on-warning-container': v('--on-warning-container'),
      },

      fontFamily: {
        display: ['var(--font-display)', 'Barlow Condensed', 'Arial Narrow', 'sans-serif'],
        body: ['var(--font-body)', 'Hanken Grotesk', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },

      fontSize: {
        'display-lg': ['56px', { lineHeight: '60px', letterSpacing: '-0.02em', fontWeight: '800' }],
        'display-lg-mobile': ['36px', { lineHeight: '40px', letterSpacing: '-0.01em', fontWeight: '800' }],
        'headline-xl': ['40px', { lineHeight: '44px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'headline-xl-mobile': ['28px', { lineHeight: '32px', letterSpacing: '0', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '28px', letterSpacing: '0.02em', fontWeight: '700' }],
        'headline-sm': ['20px', { lineHeight: '24px', letterSpacing: '0.03em', fontWeight: '600' }],
        'price-huge': ['32px', { lineHeight: '32px', fontWeight: '800' }],
        'label-badge': ['14px', { lineHeight: '16px', letterSpacing: '0.08em', fontWeight: '700' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['15px', { lineHeight: '22px', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '18px', fontWeight: '400' }],
        'spec-code': ['12px', { lineHeight: '16px', letterSpacing: '-0.01em', fontWeight: '500' }],
      },

      spacing: {
        'unit-2xs': '0.125rem',
        'unit-xs': '0.25rem',
        'unit-sm': '0.5rem',
        'unit-md': '1rem',
        'unit-lg': '1.5rem',
        'unit-xl': '2rem',
        'unit-2xl': '3rem',
        'unit-3xl': '4.5rem',
        'margin-mobile': '1rem',
        'margin-tablet': '2rem',
        'margin-desktop': '3rem',
        'gutter-mobile': '0.75rem',
        'gutter-desktop': '1.5rem',
      },

      // Tight, squared-off radii — the industrial character of the language.
      // `full` stays a true pill so avatars and count badges read as circles.
      borderRadius: {
        DEFAULT: '0.125rem',
        lg: '0.25rem',
        xl: '0.5rem',
        '2xl': '0.75rem',
        full: '9999px',
      },

      boxShadow: {
        sm: '0 1px 2px rgb(var(--shadow) / 0.06)',
        DEFAULT: '0 1px 3px rgb(var(--shadow) / 0.08), 0 1px 2px rgb(var(--shadow) / 0.04)',
        md: '0 4px 12px rgb(var(--shadow) / 0.08), 0 2px 4px rgb(var(--shadow) / 0.04)',
        lg: '0 12px 28px rgb(var(--shadow) / 0.10), 0 4px 8px rgb(var(--shadow) / 0.05)',
        xl: '0 24px 48px rgb(var(--shadow) / 0.14), 0 8px 16px rgb(var(--shadow) / 0.06)',
      },

      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        // One-shot bump for things that just changed — a cart badge
        // incrementing, a count updating. Not a loop; plays once and settles.
        pop: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.35)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'slide-up': 'slide-up 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        pop: 'pop 380ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
