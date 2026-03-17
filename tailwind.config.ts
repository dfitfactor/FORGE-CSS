import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        forge: {
          purple: '#4B1D8E',
          gold: '#D4AF37',
          'purple-dark': '#2D0F5C',
          'purple-mid': '#6B2FB5',
          'purple-light': '#8B4FD4',
          'gold-light': '#E8C84A',
          'gold-dark': '#B8960F',
          surface: '#0F0A1E',
          'surface-2': '#1A1030',
          'surface-3': '#251845',
          border: '#3D2A6E',
          'text-primary': '#F0EBF8',
          'text-secondary': '#A08EC0',
          'text-muted': '#6B5A8E',
        },
        state: {
          stable: '#22C55E',
          consolidation: '#3B82F6',
          simplified: '#F59E0B',
          recovery: '#EF4444',
          rebuild: '#8B5CF6',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'forge-gradient': 'linear-gradient(135deg, #0F0A1E 0%, #1A1030 50%, #0F0A1E 100%)',
        'forge-header': 'linear-gradient(90deg, #4B1D8E 0%, #2D0F5C 100%)',
        'gold-gradient': 'linear-gradient(135deg, #D4AF37, #E8C84A)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config
