import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

/**
 * Linter half of the toolchain (oxlint + oxfmt). `pnpm check` runs it type-aware.
 *
 * `BASELINE` turns off every preset rule the tree violated when lint came back
 * (it had been dead since `next lint` disappeared in Next 16); the number is the
 * violation count at that moment. Re-enabling one is a self-contained change:
 * delete its line together with the fixes. Never add a line here to silence new
 * code — new code meets the preset.
 */
const BASELINE = {
    "arrow-body-style": "off", // 40
    "class-methods-use-this": "off", // 1
    "complexity": "off", // 31
    "curly": "off", // 957
    "default-case": "off", // 7
    "eqeqeq": "off", // 8
    "func-style": "off", // 833
    "import/consistent-type-specifier-style": "off", // 182
    "import/newline-after-import": "off", // 2
    "import/no-duplicates": "off", // 3
    "import/no-named-as-default": "off", // 3
    "jsdoc/require-param-description": "off", // 1
    "jsx-a11y/anchor-has-content": "off", // 1
    "jsx-a11y/click-events-have-key-events": "off", // 11
    "jsx-a11y/control-has-associated-label": "off", // 3
    "jsx-a11y/heading-has-content": "off", // 2
    "jsx-a11y/label-has-associated-control": "off", // 10
    "jsx-a11y/media-has-caption": "off", // 1
    "jsx-a11y/no-noninteractive-element-interactions": "off", // 3
    "jsx-a11y/no-noninteractive-tabindex": "off", // 2
    "jsx-a11y/no-static-element-interactions": "off", // 10
    "jsx-a11y/prefer-tag-over-role": "off", // 13
    "jsx-a11y/role-has-required-aria-props": "off", // 1
    "logical-assignment-operators": "off", // 1
    "max-classes-per-file": "off", // 1
    "nextjs/no-html-link-for-pages": "off", // 2
    "nextjs/no-img-element": "off", // 67
    "no-alert": "off", // 4
    "no-await-in-loop": "off", // 34
    "no-bitwise": "off", // 103
    "no-case-declarations": "off", // 6
    "no-duplicate-imports": "off", // 2
    "no-else-return": "off", // 2
    "no-empty": "off", // 4
    "no-empty-function": "off", // 5
    "no-eq-null": "off", // 8
    "no-extra-boolean-cast": "off", // 1
    "no-inline-comments": "off", // 140
    "no-lone-blocks": "off", // 1
    "no-lonely-if": "off", // 1
    "no-multi-assign": "off", // 3
    "no-negated-condition": "off", // 25
    "no-nested-ternary": "off", // 115
    "no-param-reassign": "off", // 2
    "no-plusplus": "off", // 137
    "no-promise-executor-return": "off", // 3
    "no-redeclare": "off", // 5
    "no-regex-spaces": "off", // 1
    "no-shadow": "off", // 20
    "no-throw-literal": "off", // 9
    "no-unused-expressions": "off", // 1
    "no-unused-vars": "off", // 36
    "no-use-before-define": "off", // 73
    "no-useless-computed-key": "off", // 1
    "no-void": "off", // 18
    "no-warning-comments": "off", // 8
    "node/callback-return": "off", // 1
    "node/global-require": "off", // 1
    "object-shorthand": "off", // 17
    "one-var": "off", // 3
    "oxc/bad-bitwise-operator": "off", // 1
    "oxc/branches-sharing-code": "off", // 1
    "oxc/no-barrel-file": "off", // 16
    "prefer-destructuring": "off", // 33
    "prefer-exponentiation-operator": "off", // 7
    "prefer-named-capture-group": "off", // 43
    "prefer-template": "off", // 1
    "promise/avoid-new": "off", // 4
    "promise/no-callback-in-promise": "off", // 1
    "promise/param-names": "off", // 1
    "promise/prefer-await-to-callbacks": "off", // 22
    "promise/prefer-await-to-then": "off", // 101
    "radix": "off", // 4
    "react/button-has-type": "off", // 6
    "react/capitalized-calls": "off", // 1
    "react/exhaustive-deps": "off", // 15
    "react/exhaustive-effect-dependencies": "off", // 11
    "react/function-component-definition": "off", // 756
    "react/hook-use-state": "off", // 4
    "react/iframe-missing-sandbox": "off", // 8
    "react/immutability": "off", // 28
    "react/incompatible-library": "off", // 1
    "react/jsx-curly-brace-presence": "off", // 4
    "react/jsx-handler-names": "off", // 16
    "react/jsx-no-constructed-context-values": "off", // 8
    "react/jsx-no-target-blank": "off", // 3
    "react/jsx-no-useless-fragment": "off", // 1
    "react/memo-dependencies": "off", // 3
    "react/no-danger": "off", // 5
    "react/no-deriving-state-in-effects": "off", // 1
    "react/no-object-type-as-default-prop": "off", // 13
    "react/no-react-children": "off", // 1
    "react/no-unstable-nested-components": "off", // 16
    "react/preserve-manual-memoization": "off", // 1
    "react/purity": "off", // 29
    "react/refs": "off", // 21
    "react/rule-suppression": "off", // 5
    "react/self-closing-comp": "off", // 4
    "react/set-state-in-effect": "off", // 45
    "react/static-components": "off", // 3
    "react/todo": "off", // 11
    "react/use-memo": "off", // 1
    "require-await": "off", // 105
    "require-unicode-regexp": "off", // 101
    "sort-keys": "off", // 2182
    "sort-vars": "off", // 1
    "typescript/array-type": "off", // 4
    "typescript/await-thenable": "off", // 1
    "typescript/consistent-indexed-object-style": "off", // 1
    "typescript/consistent-return": "off", // 51
    "typescript/consistent-type-definitions": "off", // 178
    "typescript/consistent-type-imports": "off", // 5
    "typescript/no-base-to-string": "off", // 13
    "typescript/no-confusing-void-expression": "off", // 494
    "typescript/no-deprecated": "off", // 119
    "typescript/no-dynamic-delete": "off", // 1
    "typescript/no-explicit-any": "off", // 55
    "typescript/no-floating-promises": "off", // 35
    "typescript/no-import-type-side-effects": "off", // 21
    "typescript/no-inferrable-types": "off", // 2
    "typescript/no-misused-promises": "off", // 51
    "typescript/no-non-null-assertion": "off", // 30
    "typescript/no-redundant-type-constituents": "off", // 1
    "typescript/no-unnecessary-boolean-literal-compare": "off", // 1
    "typescript/no-unnecessary-type-assertion": "off", // 21
    "typescript/no-unnecessary-type-parameters": "off", // 4
    "typescript/no-unsafe-argument": "off", // 36
    "typescript/no-unsafe-assignment": "off", // 98
    "typescript/no-unsafe-call": "off", // 30
    "typescript/no-unsafe-member-access": "off", // 163
    "typescript/no-unsafe-return": "off", // 37
    "typescript/no-unsafe-type-assertion": "off", // 128
    "typescript/no-useless-default-assignment": "off", // 10
    "typescript/non-nullable-type-assertion-style": "off", // 3
    "typescript/only-throw-error": "off", // 9
    "typescript/parameter-properties": "off", // 6
    "typescript/prefer-find": "off", // 1
    "typescript/prefer-for-of": "off", // 2
    "typescript/prefer-nullish-coalescing": "off", // 117
    "typescript/prefer-readonly": "off", // 19
    "typescript/prefer-regexp-exec": "off", // 11
    "typescript/promise-function-async": "off", // 94
    "typescript/restrict-template-expressions": "off", // 3
    "typescript/return-await": "off", // 130
    "typescript/strict-boolean-expressions": "off", // 667
    "typescript/strict-void-return": "off", // 75
    "typescript/switch-exhaustiveness-check": "off", // 2
    "typescript/use-unknown-in-catch-callback-variable": "off", // 23
    "unicorn/catch-error-name": "off", // 8
    "unicorn/consistent-existence-index-check": "off", // 15
    "unicorn/consistent-function-scoping": "off", // 13
    "unicorn/custom-error-definition": "off", // 3
    "unicorn/empty-brace-spaces": "off", // 1
    "unicorn/escape-case": "off", // 2
    "unicorn/filename-case": "off", // 177
    "unicorn/import-style": "off", // 2
    "unicorn/new-for-builtins": "off", // 11
    "unicorn/no-array-for-each": "off", // 41
    "unicorn/no-array-reduce": "off", // 1
    "unicorn/no-array-reverse": "off", // 5
    "unicorn/no-array-sort": "off", // 46
    "unicorn/no-await-expression-member": "off", // 8
    "unicorn/no-document-cookie": "off", // 1
    "unicorn/no-immediate-mutation": "off", // 2
    "unicorn/no-lonely-if": "off", // 2
    "unicorn/no-negated-condition": "off", // 25
    "unicorn/no-new-array": "off", // 3
    "unicorn/no-object-as-default-parameter": "off", // 1
    "unicorn/no-useless-undefined": "off", // 17
    "unicorn/numeric-separators-style": "off", // 64
    "unicorn/prefer-add-event-listener": "off", // 18
    "unicorn/prefer-array-find": "off", // 2
    "unicorn/prefer-array-index-of": "off", // 3
    "unicorn/prefer-at": "off", // 11
    "unicorn/prefer-code-point": "off", // 9
    "unicorn/prefer-date-now": "off", // 3
    "unicorn/prefer-export-from": "off", // 12
    "unicorn/prefer-logical-operator-over-ternary": "off", // 3
    "unicorn/prefer-math-trunc": "off", // 5
    "unicorn/prefer-module": "off", // 10
    "unicorn/prefer-node-protocol": "off", // 5
    "unicorn/prefer-number-coercion": "off", // 1
    "unicorn/prefer-number-properties": "off", // 9
    "unicorn/prefer-query-selector": "off", // 1
    "unicorn/prefer-set-has": "off", // 1
    "unicorn/prefer-spread": "off", // 5
    "unicorn/prefer-string-replace-all": "off", // 38
    "unicorn/prefer-string-slice": "off", // 3
    "unicorn/prefer-ternary": "off", // 5
    "unicorn/prefer-type-error": "off", // 3
    "unicorn/require-post-message-target-origin": "off", // 3
    "unicorn/switch-case-braces": "off", // 82
    "unicorn/text-encoding-identifier-case": "off", // 3
    "unicorn/throw-new-error": "off", // 9
} as const;

export default defineConfig({
  extends: [core, react, next, vitest],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    // Separate app with its own deps, tsconfig and conventions — see owy/README.md
    "owy/**",
    "content/**",
    "public/**",
    "data/**",
    "src/admin/**",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
  ],
  rules: BASELINE,
});
