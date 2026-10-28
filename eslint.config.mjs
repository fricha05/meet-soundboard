import js from '@eslint/js';
import globals from 'globals';

// shared/settings.js is loaded as a plain script before bridge.js and popup.js, so its
// top-level names are globals for them rather than imports.
const sharedSettings = {
  BUILTIN_SOUNDS: 'readonly',
  DEFAULT_SETTINGS: 'readonly',
  soundVolume: 'readonly',
  loadSettings: 'readonly',
  allSounds: 'readonly',
};

export default [
  { ignores: ['node_modules/', 'dist/'] },
  js.configs.recommended,
  {
    files: ['content/**/*.js', 'popup/**/*.js', 'shared/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.webextensions },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['content/bridge.js', 'popup/**/*.js'],
    languageOptions: { globals: sharedSettings },
  },
  {
    files: ['shared/**/*.js'],
    rules: { 'no-unused-vars': ['error', { vars: 'local' }] },
  },
  {
    files: ['eslint.config.mjs', 'scripts/**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
];
