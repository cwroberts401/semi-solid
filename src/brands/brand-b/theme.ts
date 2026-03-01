/**
 * Brand-B design tokens.
 * brand-b uses all base components (no overrides).
 */
export const theme = {
  colors: {
    primary: '#0f4c81',
    accent: '#f59e0b',
    background: '#ffffff',
    surface: '#f9fafb',
    text: '#111827',
    textMuted: '#6b7280',
  },
  typography: {
    fontFamily: '"Helvetica Neue", sans-serif',
    headingFamily: '"Helvetica Neue", sans-serif',
  },
  spacing: {
    cardGap: '1rem',
    sectionPadding: '3rem',
  },
} as const;
