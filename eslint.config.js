import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'

// Un seul linter pour api/, web/ et e2e/. Le formatage est laissé à Prettier (voir .prettierrc.json).
export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', 'apercus/**', 'entreprise/**', 'api/drizzle/**', '**/test-results/**', '**/playwright-report/**', '.cache/**', 'secrets/**', 'backups/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['api/**/*.ts', 'e2e/**/*.{ts,mjs}', 'scripts/**/*.{ts,mts}', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['web/**/*.{ts,vue}'],
    languageOptions: { globals: globals.browser },
  },
  {
    rules: {
      // Les paramètres ou variables volontairement inutilisés commencent par « _ »
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', caughtErrors: 'none' }],
      // Les réponses de l'API, de Stripe ou des tests sont souvent typées à la volée
      '@typescript-eslint/no-explicit-any': 'off',
      // Espaces insécables : volontaires dans les expressions, textes et gabarits (format français des montants)
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipRegExps: true }],
      // Pages et vues : un seul mot est normal (Accueil, Stock…)
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    // Les tests d'interface lisent le DOM rendu : les assertions « non nulles » y sont voulues
    files: ['**/test/**/*.ts', 'e2e/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  prettier,
)
