/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#faf8f2',
          100: '#f3eedf',
          200: '#e6dcc0',
          300: '#d4c498',
          400: '#c3ad74',
          500: '#A69153',
          600: '#8f7c47',
          700: '#76653b',
          800: '#625434',
          900: '#52462e',
        },
        'qhub-green': {
          DEFAULT: '#3d4e44',
          light:   '#4f6358',
          dark:    '#2f3d35',
        },
        'qhub-cream': {
          DEFAULT: '#E7E5DB',
          light:   '#f2f1ec',
          dark:    '#d9d6c9',
        },
      },
    },
  },
  plugins: [],
}
