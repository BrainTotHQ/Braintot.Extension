import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".output/**", ".wxt/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      // Tầng domain phải thuần logic: không phụ thuộc môi trường browser/extension
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["wxt/browser", "wxt/utils/*", "firebase/*"], message: "Tầng domain phải là TypeScript thuần, không import SDK/browser API." },
          ],
        },
      ],
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  }
);
