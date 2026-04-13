/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#F4F1EC',
        'bg-alt': '#EDEAE3',
        surface: '#FFFFFF',
        'text-primary': '#1A1A18',
        'text-secondary': '#6B6860',
        'text-tertiary': '#A8A49C',
        accent: '#3D5A47',
        'accent-dim': '#6B8C74',
        border: '#D8D4CC',
        'border-strong': '#B0AB9F',
        error: '#8B3A3A',
      },
      fontFamily: {
        display: ['DM Serif Display', 'Georgia', 'serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      spacing: {
        '1': '0.5rem',
        '2': '1rem',
        '3': '1.5rem',
        '4': '2rem',
        '6': '3rem',
        '8': '4rem',
        '12': '6rem',
        '16': '8rem',
        '24': '12rem',
      },
    },
  },
  plugins: [],
}
