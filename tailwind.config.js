/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        eh: {
          bg: '#030712',
          card: '#111827',
          accent: '#10b981',
        }
      }
    },
  },
  plugins: [],
}