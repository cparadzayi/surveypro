/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Field-optimized color scheme with high contrast
        primary: {
          50: '#e6f7ff',
          100: '#bae7ff',
          200: '#91d5ff',
          300: '#69c0ff',
          400: '#40a9ff',
          500: '#1890ff',
          600: '#096dd9',
          700: '#0050b3',
          800: '#003a8c',
          900: '#002766',
        },
        success: {
          DEFAULT: '#52c41a',
          dark: '#389e0d',
        },
        warning: {
          DEFAULT: '#faad14',
          dark: '#d48806',
        },
        error: {
          DEFAULT: '#f5222d',
          dark: '#cf1322',
        },
        field: {
          // High visibility colors for field use
          bg: '#ffffff',
          text: '#000000',
          border: '#d9d9d9',
          highlight: '#ffd700',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Larger base sizes for mobile/field use
        'base': '16px',
        'lg': '18px',
        'xl': '20px',
      },
      spacing: {
        // Touch-friendly spacing
        'touch': '44px',
      }
    },
  },
  plugins: [],
}
