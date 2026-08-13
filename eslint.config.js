const globals = {
  Buffer: "readonly",
  AbortSignal: "readonly",
  URL: "readonly",
  __dirname: "readonly",
  console: "readonly",
  fetch: "readonly",
  module: "readonly",
  process: "readonly",
  require: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  setTimeout: "readonly",
};

module.exports = [
  {
    ignores: ["node_modules/**", "uploads/**"],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals,
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-constant-condition": "error",
      eqeqeq: ["error", "always"],
    },
  },
];
