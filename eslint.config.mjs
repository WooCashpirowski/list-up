import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'

const moduleNames = [
  'app-shell',
  'auth',
  'categories',
  'i18n',
  'list-items',
  'lists',
  'offline',
  'profiles',
]
const relativeInternalModulePatterns = Array.from(
  { length: 6 },
  (_, index) => '../'.repeat(index + 1),
).flatMap((prefix) =>
  moduleNames.flatMap((moduleName) => [
    `${prefix}${moduleName}/*`,
    `${prefix}${moduleName}/**`,
  ]),
)

const modulePublicApiPatterns = [
  {
    group: [
      '@/src/modules/*/*',
      '@/src/modules/*/**',
      ...relativeInternalModulePatterns,
    ],
    message:
      'Import another module through its public src/modules/<module>/index.ts API.',
  },
]

const infrastructureRestrictions = {
  paths: [
    {
      name: '@supabase/supabase-js',
      message: 'Use a domain gateway instead of importing Supabase directly.',
    },
    {
      name: '@supabase/ssr',
      message: 'Use a domain gateway instead of importing Supabase directly.',
    },
  ],
  patterns: [
    ...modulePublicApiPatterns,
    {
      group: ['@/src/lib/supabase/*', '@/src/lib/supabase/**'],
      message: 'Use a domain gateway instead of importing Supabase directly.',
    },
  ],
}

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
  ]),
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: modulePublicApiPatterns },
      ],
    },
  },
  {
    files: ['src/lib/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...modulePublicApiPatterns,
            {
              group: [
                '@/src/modules/*',
                '@/src/modules/*/**',
                '../modules/*',
                '../modules/*/**',
                '../../modules/*',
                '../../modules/*/**',
                '../../../modules/*',
                '../../../modules/*/**',
              ],
              message: 'Shared infrastructure cannot depend on domain modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/modules/*/index.{ts,tsx}',
      'src/modules/**/components/**/*.{ts,tsx}',
      'src/modules/**/gateways/**/*.{ts,tsx}',
      'src/modules/**/hooks/**/*.{ts,tsx}',
      'src/modules/**/model/**/*.{ts,tsx}',
      'src/modules/**/types/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['error', infrastructureRestrictions],
    },
  },
])
