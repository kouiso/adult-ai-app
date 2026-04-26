import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-plugin-prettier";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import security from "eslint-plugin-security";
import unicorn from "eslint-plugin-unicorn";
import unusedImports from "eslint-plugin-unused-imports";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist", ".wrangler/", "drizzle/schema.ts"]),

  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaVersion: 2020,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: globals.browser,
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      prettier,
      import: importPlugin,
      "unused-imports": unusedImports,
      "jsx-a11y": jsxA11y,
      react,
      unicorn,
      security,
    },
    rules: {
      "prettier/prettier": "error",

      // typescript-eslint 厳格ルール
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-use-before-define": "error",
      "@typescript-eslint/no-shadow": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          vars: "all",
          args: "after-used",
          ignoreRestSiblings: false,
        },
      ],

      // 未使用import
      "unused-imports/no-unused-vars": [
        "error",
        {
          vars: "all",
          args: "after-used",
        },
      ],
      "unused-imports/no-unused-imports": "error",

      // import 順序
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "object",
            "type",
            "index",
          ],
          "newlines-between": "always",
          pathGroupsExcludedImportTypes: ["builtin"],
          alphabetize: { order: "asc", caseInsensitive: true },
          pathGroups: [
            { pattern: "react**", group: "external", position: "before" },
            { pattern: "@/**", group: "internal", position: "before" },
          ],
        },
      ],
      "import/no-default-export": "error",
      "import/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "src/test/**/*.ts", "vite.config.ts", "vitest.config.ts", "drizzle.config.ts"],
          optionalDependencies: false,
        },
      ],

      // React
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/jsx-no-bind": [
        "error",
        {
          ignoreDOMComponents: false,
          ignoreRefs: true,
          allowArrowFunctions: true,
          allowFunctions: false,
          allowBind: false,
        },
      ],
      "react/button-has-type": "error",
      "react/function-component-definition": [
        "error",
        {
          namedComponents: "arrow-function",
          unnamedComponents: "arrow-function",
        },
      ],

      // アクセシビリティ
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-noninteractive-element-interactions": "error",

      // unicorn
      "unicorn/better-regex": "error",
      "unicorn/prefer-array-flat-map": "error",
      "unicorn/prefer-query-selector": "error",
      "unicorn/new-for-builtins": "error",
      "unicorn/no-array-push-push": "error",
      "unicorn/no-for-loop": "error",
      "unicorn/prevent-abbreviations": "off",
      "unicorn/no-null": "off",
      "unicorn/no-array-reduce": "off",
      "unicorn/filename-case": "off",
      "unicorn/no-anonymous-default-export": "off",

      // セキュリティ
      // TypeScript型システムで保護されているケースでもfalse positiveが多いため無効化
      "security/detect-object-injection": "off",
      "security/detect-non-literal-regexp": "warn",
      "security/detect-unsafe-regex": "error",

      // 一般ルール
      "no-console": ["warn", { allow: ["error", "warn", "info"] }],
      "no-alert": "error",
      "no-param-reassign": "error",
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-return-assign": "error",
      "no-self-compare": "error",
      "no-sequences": "error",
      "no-unused-expressions": "error",
      "no-useless-concat": "error",
      "no-debugger": "error",
      "arrow-body-style": ["error", "as-needed"],
      "no-useless-constructor": "error",
      "max-depth": ["error", { max: 3 }],
      complexity: ["error", { max: 10 }],
    },
    settings: {
      react: { version: "detect" },
      "import/resolver": {
        typescript: { alwaysTryTypes: true },
      },
    },
  },

  {
    // shadcn/ui はコンポーネントと variants 関数を同一ファイルでexportするのが仕様
    files: ["src/component/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
      "import/no-default-export": "off",
      "react/function-component-definition": "off",
    },
  },

  {
    // functionsはCloudflare Pages向けでonRequest named exportが必須
    files: ["functions/**/*.ts"],
    rules: {
      "import/no-default-export": "off",
    },
  },

  {
    // E2E harness は運用スクリプトのためアプリ本体より複雑度・export形式を緩める
    files: ["script/e2e/**/*.ts"],
    rules: {
      complexity: "off",
      "max-depth": "off",
      "import/no-default-export": "off",
      "import/no-extraneous-dependencies": "off",
      "import/order": "off",
      "prettier/prettier": "off",
    },
  },

  {
    // 既存パーサー正規表現の false positive を抑制
    files: ["src/lib/quality-guard.ts", "src/lib/xml-response-parser.ts"],
    rules: {
      "security/detect-unsafe-regex": "off",
      "unicorn/better-regex": "off",
    },
  },

  {
    // 既存UIの型付きイベントハンドラ・表示分岐は現行実装を維持する
    files: ["src/component/chat/conversation-list.tsx", "src/component/chat/message-bubble.tsx"],
    rules: {
      "@typescript-eslint/no-misused-promises": "off",
      complexity: "off",
    },
  },

  {
    // エントリポイント・設定ファイルはdefault exportが必要
    files: ["src/main.tsx", "vite.config.ts", "vitest.config.ts", "drizzle.config.ts"],
    rules: {
      "import/no-default-export": "off",
    },
  },

  eslintConfigPrettier,
]);
