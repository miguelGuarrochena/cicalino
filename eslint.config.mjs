import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/* eslint-config-next 16 ships flat config natively, so it gets spread in
 * directly — no FlatCompat.
 *
 * The project had `next lint` in package.json, which stopped existing in
 * Next 16: the script was failing with "no such directory: lint", so nothing
 * had actually been linted in a while. */
export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
      "drizzle/**",
      "next-env.d.ts",
    ],
  },

  ...coreWebVitals,
  ...typescript,

  {
    rules: {
      /* Unused code is worth catching, but an unused function argument is
       * often there to document a signature. The underscore prefix is the
       * usual way to say "I know, it's on purpose". */
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      /* Warnings, not errors, and deliberately so.
       *
       * These two flag a pattern the codebase uses everywhere: effects that
       * fetch and then setState, and render-time reads of Date.now(). They're
       * fair points — the first causes an extra render pass, the second makes
       * render depend on the wall clock — but there are ~23 of them and fixing
       * them properly means restructuring the data hooks, not tweaking lines.
       *
       * Turning them off would hide the backlog; leaving them as errors would
       * mean landing this config with a red build and nobody could add a rule
       * after that. So: visible, counted, and not blocking. Worth clearing in
       * its own pass. */
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },

  {
    /* This file is a flat config: a default-exported array is the format. */
    files: ["eslint.config.mjs"],
    rules: { "import/no-anonymous-default-export": "off" },
  },

  {
    /* Tests do things that would be suspicious in app code. */
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
