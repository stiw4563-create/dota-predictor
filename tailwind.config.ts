import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        sans: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        ink: {
          950: '#07090d',
          900: '#0b0e14',
          850: '#11151d',
          800: '#161b25',
          700: '#1e2533',
          600: '#2a3344',
          500: '#3a455a',
          400: '#5a6478',
          300: '#8892a6',
          200: '#b8c0cf',
          100: '#dfe3ec',
          50: '#f1f3f8',
        },
        radiant: {
          DEFAULT: '#a8c764',
          dim: '#6b7d3f',
          glow: '#d7e89a',
        },
        dire: {
          DEFAULT: '#c84141',
          dim: '#7d2828',
          glow: '#e88080',
        },
        sand: '#e8e4d8',
      },
      animation: {
        'pulse-soft': 'pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fade-in 0.4s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
