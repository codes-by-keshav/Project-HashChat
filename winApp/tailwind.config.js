/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.{html,js}"],
  theme: {
    extend: {
      fontFamily: {
        'dancing': ['"Dancing Script"', 'cursive'],
        'exo': ['"Exo 2"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}