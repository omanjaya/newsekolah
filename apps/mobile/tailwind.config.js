/** @type {import('tailwindcss').Config} */
// Tokens mirror DESIGN.md: warm neutrals, one accent per tenant, status colors that
// stay stable across schools, radius 4/8 only (999 reserved for avatars), no gradients.
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "#F7F6F3", dark: "#141414" },
        surface: { DEFAULT: "#FFFFFF", dark: "#1C1C1C" },
        ink: { DEFAULT: "#1A1A1A", dark: "#ECECEC" },
        line: { DEFAULT: "#E3E1DC", dark: "#2A2A2A" },
        // Accent is read from a CSS variable so tenant branding can override it at
        // runtime (see src/theme/accent.ts) without a rebuild.
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        status: {
          present: "#2F6B3A",
          sick: "#8A6D1F",
          permit: "#3F5F8A",
          dispensation: "#6B4A8A",
          absent: "#A3382F",
          late: "#B5651D",
        },
      },
      borderRadius: {
        input: "4px",
        chip: "4px",
        card: "8px",
        dialog: "8px",
      },
      fontSize: {
        xs: "12px",
        sm: "13px",
        base: "14px",
        md: "16px",
        lg: "20px",
        xl: "24px",
        "2xl": "32px",
      },
    },
  },
  plugins: [],
};
