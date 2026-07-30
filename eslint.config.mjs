import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

/**
 * ESLint — architecture enforced mechanically per spec §06.12:
 * no deep relative imports (alias only), server/** unimportable from client
 * graphs (paired with 'server-only' import guard), no raw query keys, no
 * direct lucide-react imports outside the icon registry. Grep-style audits
 * that ESLint cannot express live in scripts/arch-grep.sh (§04.13).
 */
export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "supabase/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript", "prettier"),
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // §06.12 — no ../../ deep relative imports; use @/* alias
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*"],
              message:
                "Deep relative imports are banned (§06.12) — use the @/* alias.",
            },
            {
              group: ["lucide-react"],
              message:
                "Import icons via the icon registry (components/app/icons), not lucide-react directly (§04.8).",
            },
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
    },
  },
  {
    // The icon registry itself is the single permitted lucide-react importer.
    files: ["src/components/app/icons.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*"],
              message:
                "Deep relative imports are banned (§06.12) — use the @/* alias.",
            },
          ],
        },
      ],
    },
  },
);
