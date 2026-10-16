import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Paleta alinhada com o design Maikon
        // Cores via variável CSS (canal RGB) pra o painel poder trocar de paleta sem mexer em
        // classe nenhuma (globals.css → .painel-novo). Padrão = o azul-claro de sempre.
        brand: {
          50:  'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)', // primary — azul Santuário Nerd
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },
        // Roxo/violeta usados como cor de STATUS no painel (fila, pré-venda, cartão, variação).
        // No painel novo viram azul-céu (roxo não é cor da loja); fora dele, o roxo original.
        purple: {
          300: 'rgb(var(--status-300, 216 180 254) / <alpha-value>)',
          400: 'rgb(var(--status-400, 192 132 252) / <alpha-value>)',
          500: 'rgb(var(--status-500, 168 85 247) / <alpha-value>)',
          600: 'rgb(var(--status-600, 147 51 234) / <alpha-value>)',
        },
        violet: {
          300: 'rgb(var(--status-300, 196 181 253) / <alpha-value>)',
          400: 'rgb(var(--status-400, 167 139 250) / <alpha-value>)',
          500: 'rgb(var(--status-500, 139 92 246) / <alpha-value>)',
          600: 'rgb(var(--status-600, 124 58 237) / <alpha-value>)',
          700: 'rgb(var(--status-700, 109 40 217) / <alpha-value>)',
        },
        surface: {
          900: '#121215', // Fundo da página (app bg)
          800: '#1A1A1F', // Sidebar / cards
          700: '#1E1E24', // Cards internos / hover
          600: '#1E1E24', // Input bg
          500: '#2D2D36', // Borders
          400: '#3a3a47', // Muted bg
        },
        accent: {
          gold:   '#FFE45E',
          green:  '#00F0A8',
          red:    '#FF3B30',
          blue:   '#3b82f6',
          orange: '#f97316',
        }
      },
      fontFamily: {
        sans: ['var(--font-nunito)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow':   'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in':     'slideIn 0.3s ease-out',
        'fade-in':      'fadeIn 0.2s ease-out',
        'bounce-in':    'bounceIn 0.4s ease-out',
      },
      keyframes: {
        slideIn:  { from: { transform: 'translateX(-1rem)', opacity: '0' }, to: { transform: 'translateX(0)', opacity: '1' } },
        fadeIn:   { from: { opacity: '0', transform: 'translateY(0.5rem)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        bounceIn: { '0%': { transform: 'scale(0.9)', opacity: '0' }, '70%': { transform: 'scale(1.02)' }, '100%': { transform: 'scale(1)', opacity: '1' } },
      },
    },
  },
  plugins: [],
}

export default config
