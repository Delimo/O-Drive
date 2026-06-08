/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.html", "./public/**/*.js"],
  theme: {
    extend: {
      colors: {
        primary: '#60a5fa',
        background: '#f5f7fb',
        surface: '#ffffff',
        'surface-soft': '#f8fafc',
        border: '#d9e1ee',
      },
    },
  },
  plugins: [],
};
