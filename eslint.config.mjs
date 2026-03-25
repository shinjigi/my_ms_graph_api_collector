import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  // 1. Regole base JS
  eslint.configs.recommended,

  // 2. Regole base TS (usiamo l'espansione dell'array)
  ...tseslint.configs.recommended,

  // 3. La tua configurazione specifica
  {
    files: ["src/**/*.ts", "shared/**/*.ts", "scripts/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser, // Specifichiamo il parser esplicitamente
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // 4. Disabilita i controlli sui file JS
  {
    files: ["**/*.js", "**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },

  // 5. File da ignorare
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "zucchetti_automation/**",
      "web/**",
      "data/**",
    ],
  },

  // 6. Prettier sempre per ultimo
  eslintConfigPrettier,
];
