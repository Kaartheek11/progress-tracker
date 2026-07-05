/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        soft: "0 18px 50px rgba(24, 33, 45, 0.10)"
      },
      colors: {
        ink: "#15202b",
        shore: "#f6f3ee",
        pine: "#15615b",
        mint: "#d7f2e9",
        coral: "#e8644d",
        ambered: "#f6b83f",
        plum: "#7a4f8f"
      }
    }
  },
  plugins: []
};
