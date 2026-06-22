/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.html", "./public/**/*.js"],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        'primary-strong': '#2563eb',
        background: '#f8fafc',
        surface: '#ffffff',
        'surface-soft': '#f8fafc',
        border: '#e2e8f0',
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', '"Segoe UI"', 'Tahoma', 'sans-serif'],
        mono: ['"Cascadia Mono"', '"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(15, 23, 42, 0.04)',
      },
    },
  },
  plugins: [],
};
