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
          purple: 'rgb(var(--forge-purple) / <alpha-value>)',
          gold: 'rgb(var(--forge-gold) / <alpha-value>)',
          'purple-dark': 'rgb(var(--forge-purple-dark) / <alpha-value>)',
          'purple-mid': 'rgb(var(--forge-purple-mid) / <alpha-value>)',
          'purple-light': 'rgb(var(--forge-purple-light) / <alpha-value>)',
          'gold-light': 'rgb(var(--forge-gold-light) / <alpha-value>)',
          'gold-dark': 'rgb(var(--forge-gold-dark) / <alpha-value>)',
          surface: 'rgb(var(--forge-surface) / <alpha-value>)',
          'surface-2': 'rgb(var(--forge-surface-2) / <alpha-value>)',
          'surface-3': 'rgb(var(--forge-surface-3) / <alpha-value>)',
          border: 'rgb(var(--forge-border) / <alpha-value>)',
          'text-primary': 'rgb(var(--forge-text-primary) / <alpha-value>)',
          'text-secondary': 'rgb(var(--forge-text-secondary) / <alpha-value>)',
          'text-muted': 'rgb(var(--forge-text-muted) / <alpha-value>)',
        },
        state: {
          stable: '#22C55E',
          consolidation: '#3B82F6',
          simplified: '#F59E0B',
          recovery: '#EF4444',
          rebuild: '#8B5CF6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'forge-gradient': 'linear-gradient(135deg, rgb(var(--forge-surface)) 0%, rgb(var(--forge-surface-2)) 50%, rgb(var(--forge-surface)) 100%)',
        'forge-header': 'linear-gradient(90deg, rgb(var(--forge-purple)) 0%, rgb(var(--forge-purple-dark)) 100%)',
        'gold-gradient': 'linear-gradient(135deg, rgb(var(--forge-gold)), rgb(var(--forge-gold-light)))',
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