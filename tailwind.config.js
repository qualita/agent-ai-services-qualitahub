/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#e6f2ff',
          100: '#b3d9ff',
          200: '#80bfff',
          300: '#4da6ff',
          400: '#1a8cff',
          500: '#0079EE',
          600: '#0056e2',
          700: '#0046b8',
          800: '#00368e',
          900: '#002664',
        },
        'qhub-green': {
          DEFAULT: '#091111',
          light:   '#142020',
          dark:    '#000808',
        },
        'qhub-cream': {
          DEFAULT: '#e3e1e8',
          light:   '#f1f4f5',
          dark:    '#c9c7d0',
        },
      },
    },
  },
  plugins: [],
}
