/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          canvas: 'var(--color-surface-canvas)',
          panel: 'var(--color-surface-panel)',
          card: 'var(--color-surface-card)',
          subtle: 'var(--color-surface-subtle)',
          hover: 'var(--color-surface-hover)',
          active: 'var(--color-surface-active)'
        },
        content: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          inverse: 'var(--color-text-inverse)'
        },
        edge: {
          subtle: 'var(--color-border-subtle)',
          default: 'var(--color-border-default)',
          strong: 'var(--color-border-strong)'
        },
        brand: {
          primary: 'var(--color-accent-primary)',
          hover: 'var(--color-accent-hover)',
          subtle: 'var(--color-accent-subtle)',
          contrast: 'var(--color-accent-contrast)'
        },
        status: {
          success: 'var(--color-status-success)',
          successSubtle: 'var(--color-status-success-subtle)',
          warning: 'var(--color-status-warning)',
          warningSubtle: 'var(--color-status-warning-subtle)',
          danger: 'var(--color-status-danger)',
          dangerSubtle: 'var(--color-status-danger-subtle)'
        }
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        card: 'var(--shadow-card)',
        dropdown: 'var(--shadow-dropdown)'
      }
    },
  },
  plugins: [],
}
