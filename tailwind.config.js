/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0f1117',
        surface: '#1a1d27',
        surface2: '#222536',
        border: '#2e3247',
        muted: '#7a84a8',
        accent: '#6366f1',
      },
    },
  },
  plugins: [],
}
