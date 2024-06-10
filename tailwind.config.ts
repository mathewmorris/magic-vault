import { type Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      dropShadow: {
        glow: '0 0 4px #fa0aa9'
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
