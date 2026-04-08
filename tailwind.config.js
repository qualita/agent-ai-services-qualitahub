/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0fdfc',
          100: '#ccfbf5',
          200: '#99f0ea',
          300: '#5ee5d9',
          400: '#2dd5c8',
          500: '#00BFB2',
          600: '#00A89C',
          700: '#008F85',
          800: '#006B64',
          900: '#004A45',
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
