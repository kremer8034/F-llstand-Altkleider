import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantische Rollen; die Werte stehen als CSS-Variablen in globals.css
        // und werden dort fuer den Dunkelmodus einmal zentral getauscht.
        plane: "var(--plane)",
        flaeche: "var(--flaeche)",
        "flaeche-2": "var(--flaeche-2)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        linie: "var(--linie)",
        achse: "var(--achse)",
        serie: "var(--serie)",
        gut: "var(--gut)",
        warnung: "var(--warnung)",
        ernst: "var(--ernst)",
        kritisch: "var(--kritisch)",
        unbekannt: "var(--unbekannt)",
        brk: "var(--brk)",
      },
      borderColor: {
        DEFAULT: "var(--rand)",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
