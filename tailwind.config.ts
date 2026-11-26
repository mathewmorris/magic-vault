import { type Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      dropShadow: {
        glow: '0 0 4px #fa0aa9'
      },
      keyframes: {
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(0.5rem)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        // The spell a card casts when it taps (see SpellProvider). A wash of
        // color spreads out and fades while colored pips swirl away from it.
        'spell-wash': {
          '0%': { opacity: '0', transform: 'scale(0.05)' },
          '30%': { opacity: '0.9' },
          '65%': { opacity: '0.7', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(1.08)' },
        },
        'spell-swirl': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(150deg)' },
        },
        'spell-pip': {
          '0%': { opacity: '0', transform: 'translate(-50%, -50%) translateX(0) scale(0.3)' },
          '15%': { opacity: '1' },
          '70%': { opacity: '1' },
          '100%': { opacity: '0', transform: 'translate(-50%, -50%) translateX(var(--pip-distance)) scale(1.2)' },
        },
      },
      animation: {
        'toast-in': 'toast-in 150ms ease-out',
        'spell-wash': 'spell-wash 650ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'spell-swirl': 'spell-swirl 650ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'spell-pip': 'spell-pip 580ms cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      container: {
        padding: {
          DEFAULT: '1rem',
          sm: '2rem',
          md: '3rem',
          lg: '4rem',
          xl: '5rem',
          '2xl': '6rem',
        },
      },
      colors: {
        pink: {
          '100': '#fcd4e6',  // Lightest pink
          '200': '#fca9cd',
          '300': '#fc7eb4',
          '400': '#fb559b',
          '500': '#fa0aa9',  // Mid pink
          '600': '#d70996',
          '700': '#b40882',
          '800': '#910770',
          '900': '#6e0658',
          '950': '#4b0540',  // Darkest pink
        },
        purple: {
          '100': '#a094c8',  // Lightest purple
          '200': '#8477b5',
          '300': '#685aa2',
          '400': '#4c3d8f',
          '500': '#510f8e',  // Mid purple
          '600': '#450e81',
          '700': '#390d74',
          '800': '#2d0c67',
          '900': '#210b5a',
          '950': '#150a4d',  // Darkest purple
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
