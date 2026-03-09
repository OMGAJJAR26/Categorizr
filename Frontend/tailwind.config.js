export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // roboto: ['Roboto', 'sans-serif'],
         sans: ["DM Sans", "sans-serif"],
      },
      screens: {
        'xs': '480px',
        // Default Tailwind breakpoints
        // 'sm': '640px',
        // 'md': '768px',
        // 'lg': '1024px',
        // 'xl': '1280px',
        // '2xl': '1536px',
      },
    },
  },
  plugins: [],
};
