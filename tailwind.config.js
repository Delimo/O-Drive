/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.html", "./public/**/*.js"],
  theme: {
    extend: {
      colors: {
        primary: '#60a5fa',
        background: '#0b1220',
        surface: '#111827',
        border: '#243244',
      }
    },
  },
  plugins: [],
}
