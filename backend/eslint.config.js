import js from '@eslint/js';
import globals from 'globals';

/*
 * Architecture rules (docs/architecture.md). `npm run lint` fails if code crosses a boundary.
 *
 *   modules never import each other      (they talk over HTTP: they run in different containers)
 *   shared never imports a module
 *   inside a module:  api -> application -> domain;  infrastructure -> application -> domain
 *   domain imports nothing outside domain; application never touches infrastructure or api
 */

// Libraries only infrastructure, api and entrypoints may use.
const INFRASTRUCTURE_LIBS = [
  'express',
  'ws',
  'mssql',
  'cors',
  'http',
  'https',
  'node:http',
  'node:https',
];
const libs = (message) => INFRASTRUCTURE_LIBS.map((name) => ({ name, message }));
const MODULES = ['game', 'players'];

const restrict = (paths, groups, message) => [
  'error',
  { paths, patterns: [{ group: groups, message }] },
];

const moduleRules = MODULES.flatMap((module) => {
  // Relative imports like '../../players/domain/x.js' contain the other module's folder name.
  const others = MODULES.filter((m) => m !== module).map((m) => `**/${m}/**`);
  const base = `src/modules/${module}`;
  return [
    {
      files: [`${base}/**/*.js`],
      rules: {
        'no-restricted-imports': restrict(
          [],
          [...others, '**/entrypoints/**'],
          `Module "${module}" must not import another module or an entrypoint. Call the other service over HTTP (infrastructure).`,
        ),
      },
    },
    {
      files: [`${base}/domain/**/*.js`],
      rules: {
        'no-restricted-imports': restrict(
          libs('The domain is pure: no frameworks, databases or network.'),
          [
            ...others,
            '**/application/**',
            '**/infrastructure/**',
            '**/api/**',
            '**/shared/**',
            '**/entrypoints/**',
          ],
          'The domain is the core: it may only import files inside its own domain folder.',
        ),
      },
    },
    {
      files: [`${base}/application/**/*.js`],
      rules: {
        'no-restricted-imports': restrict(
          libs('Use cases reach the outside world only through ports passed in.'),
          [...others, '**/infrastructure/**', '**/api/**', '**/shared/**', '**/entrypoints/**'],
          'Application code may import its own domain and application only; infrastructure is injected through ports.',
        ),
        'no-restricted-globals': [
          'error',
          {
            name: 'fetch',
            message: 'Call other services through a port implemented in infrastructure.',
          },
        ],
      },
    },
  ];
});

export default [
  { ignores: ['coverage/', 'node_modules/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: { eqeqeq: 'error', 'no-var': 'error', 'prefer-const': 'error' },
  },
  ...moduleRules,
  {
    files: ['src/shared/**/*.js'],
    rules: {
      'no-restricted-imports': restrict(
        [],
        ['**/modules/**', '**/entrypoints/**'],
        'shared/ is used by modules; it must not depend on any module.',
      ),
    },
  },
];
