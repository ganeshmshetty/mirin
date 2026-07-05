const colors = require('tailwindcss/colors');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f7ff',
          100: '#e0efff',
          200: '#c1e0ff',
          300: '#a1d0ff',
          400: '#61adff',
          500: '#228be6',
          600: '#1a75d4',
          700: '#145da9',
          800: '#104a87',
          900: '#0c3a6a',
          950: '#072443',
        },
        gray: colors.neutral,
        app: {
          DEFAULT: 'var(--bg-app)',
          sidebar: 'var(--bg-sidebar)',
          card: 'var(--bg-card)',
          input: 'var(--bg-input)',
          border: 'var(--border-color)',
          text: 'var(--text-primary)',
          muted: 'var(--text-secondary)',
          active: 'var(--bg-active-tab)',
          'active-text': 'var(--text-active-tab)',
          hover: 'var(--bg-hover)',
        },
      },
      keyframes: {
        'slide-down': {
          '0%': { opacity: 0, transform: 'translateY(-10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'slide-up': {
            '0%': { opacity: 0, transform: 'translateY(10px)' },
            '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'fade-in': {
            '0%': { opacity: 0 },
            '100%': { opacity: 1 },
        },
      },
      animation: {
        'slide-down': 'slide-down 0.3s ease-out forwards',
        'slide-up': 'slide-up 0.3s ease-out forwards',
        'fade-in': 'fade-in 0.2s ease-in-out forwards',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
