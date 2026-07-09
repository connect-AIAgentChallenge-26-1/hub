/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ShowUp 브랜드 색상 (임시)
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        // 위험도 색상
        risk: {
          low: '#22c55e',    // 초록 - 안심
          medium: '#eab308', // 노랑 - 주의
          high: '#ef4444',   // 빨강 - 위험
        }
      },
      minHeight: {
        'screen': '100dvh', // dynamic viewport height
      }
    },
  },
  plugins: [],
}
