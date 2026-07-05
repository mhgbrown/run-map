const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
  // Global ignores
  {
    ignores: ['node_modules/**', 'data/runs.json', 'assets/**'],
  },

  // Base configuration
  js.configs.recommended,

  // Frontend configuration (Browser, ES Modules)
  {
    files: ['src/web/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        L: 'readonly', // Leaflet map global object
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },

  // Backend parser and configuration scripts (Node.js, CommonJS)
  {
    files: ['src/parser/**/*.js', 'src/strava/**/*.js', 'test/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },

  // Apply prettier to override styling rules
  prettier,
];
