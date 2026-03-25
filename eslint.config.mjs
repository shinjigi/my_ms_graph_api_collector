import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default [
  // 1. Regole base JS
  eslint.configs.recommended,

  // 2. Regole base TS (usiamo l'espansione dell'array)
  ...tseslint.configs.recommended,

  // 3. Type-aware rules for src/ and shared/ only (in tsconfig.json project)
  {
    files: ["src/**/*.ts", "shared/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // 4. scripts/ — TS syntax only, no type-aware rules (scripts have their own tsconfig)
  {
    files: ["scripts/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // 5. JS files — disable type-checked rules, add Node.js globals
  //    no-require-imports is disabled because these are legacy CJS modules
  {
    files: ["**/*.js", "**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
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
