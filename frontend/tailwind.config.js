/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        nav: "#1F3864",
        accent: "#E07B00",
        azure: "#A5C9EB",
      },
    },
  },
  plugins: [],
};
