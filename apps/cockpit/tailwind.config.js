/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        obs: { DEFAULT: '#f97316', light: '#fed7aa' },         // Orange — Observability
        quality: { DEFAULT: '#22c55e', light: '#bbf7d0' },     // Green — Quality
        flow: { DEFAULT: '#14b8a6', light: '#99f6e4' },        // Teal — Flow
        contract: { DEFAULT: '#3b82f6', light: '#bfdbfe' },    // Blue — Contract
        feedback: { DEFAULT: '#a855f7', light: '#e9d5ff' },    // Violet — Feedback
        hitl: { DEFAULT: '#ec4899', light: '#fbcfe8' },        // Pink — HITL
      },
    },
  },
  plugins: [],
}
