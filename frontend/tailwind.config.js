/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      boxShadow: {
        glow: "0 0 0 1px rgba(34, 211, 238, 0.12), 0 10px 30px rgba(0, 0, 0, 0.35)",
      },
    },
  },
  plugins: [],
};
