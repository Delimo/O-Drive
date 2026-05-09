/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.html", "./public/**/*.js"],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        background: '#020617',
        surface: '#0f172a',
        border: '#1e293b',
      }
    },
  },
  plugins: [],
}
