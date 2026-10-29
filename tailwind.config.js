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
          dark: '#101010',
          panel: '#121212',
          panelHeader: '#181818',
          card: '#242424',
          cardHover: '#2e2e2e',
          border: '#2e2e2e',
          borderCard: '#383838',
          accent: '#00b0ff',
          accentHover: '#0095d9',
          green: '#10b981',
          yellow: '#f59e0b',
          orange: '#f97316',
          muted: '#707070',
          text: '#EEEEEE',
          textSub: '#A8A8A8'
        }
      }
    },
  },
  plugins: [],
}

