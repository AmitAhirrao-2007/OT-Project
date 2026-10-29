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
        abrp: {
          dark: '#12161a',
          panel: '#181f26',
          panelHeader: '#1e2630',
          card: '#222b35',
          cardHover: '#2a3542',
          border: '#2c3744',
          accent: '#00b0ff',
          accentHover: '#0095d9',
          green: '#22c55e',
          yellow: '#eab308',
          orange: '#f97316',
          muted: '#8e9aa8',
          text: '#f1f5f9',
          textSub: '#94a3b8'
        }
      }
    },
  },
  plugins: [],
}
