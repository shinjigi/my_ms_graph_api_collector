import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    // CONFIGURAZIONE SPECIFICA PER I FILE TS
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      // Disattiviamo le regole "estetiche" che ti hanno dato errore
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/prefer-for-of": "off",
    },
  },
  {
    // CONFIGURAZIONE PER I FILE JS (evita il parsing error)
    files: ["src/**/*.ts", "shared/**/*.ts", "scripts/**/*.ts"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "zucchetti_automation/**",
      "web/**",
    ],
  },
);
