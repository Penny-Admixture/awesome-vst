/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#a78bfa',
          dim: '#7c3aed',
        },
      },
    },
  },
  plugins: [],
}
