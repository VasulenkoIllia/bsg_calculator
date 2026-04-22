/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bsg: {
          ink: "#0b1329",
          slate: "#5b657a",
          sky: "#1d4ed8",
          mint: "#0f766e",
          mist: "#e8eefc"
        }
      },
      boxShadow: {
        panel: "0 18px 50px -26px rgba(15, 23, 42, 0.4)"
      },
      fontFamily: {
        sans: ["Manrope", "Segoe UI", "system-ui", "sans-serif"]
      },
      backgroundImage: {
        "bsg-surface":
          "radial-gradient(circle at 0% 0%, rgba(59,130,246,.18), transparent 45%), radial-gradient(circle at 85% 20%, rgba(16,185,129,.16), transparent 34%), linear-gradient(180deg, #f8fbff 0%, #eef4ff 45%, #f7fafc 100%)"
      }
    }
  },
  plugins: []
};
