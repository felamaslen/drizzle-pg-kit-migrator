import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import prettierPlugin from "eslint-plugin-prettier";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "dist",
      "node_modules",
      "examples/*/node_modules",
      "examples/*/dist",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      prettier: prettierPlugin,
      import: importPlugin,
    },
    rules: {
      "prettier/prettier": "error",
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  prettierConfig,
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      globals: {
        // vitest globals (matches `globals: true` in vitest.config.ts).
        afterAll: "readonly",
        afterEach: "readonly",
        assert: "readonly",
        beforeAll: "readonly",
        beforeEach: "readonly",
        chai: "readonly",
        describe: "readonly",
        expect: "readonly",
        it: "readonly",
        suite: "readonly",
        test: "readonly",
        vi: "readonly",
        vitest: "readonly",
      },
    },
  },
];
