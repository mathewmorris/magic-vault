import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  dir: './',
})

const config: Config = {
  coverageProvider: 'v8',
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  // Integration tests need a real database; run them with `npm run test:integration`.
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/e2e/', '\\.integration\\.test\\.ts$'],
  moduleNameMapper: {
    "^singleton$": "<rootDir>/singleton.ts",
    // The tsconfig "~/" alias, so jest.mock("~/...") resolves like imports do.
    "^~/(.*)$": "<rootDir>/src/$1",
  },
  setupFilesAfterEnv: ['<rootDir>/singleton.ts'],
  clearMocks: true,
}

// PGlite (in-process Postgres for raw SQL tests) ships a CommonJS build that
// still loads Node built-ins with dynamic import(). Run that one package
// through a small transform that turns those into require().
const PGLITE_CJS = '/node_modules/@electric-sql/pglite/dist/.*\\.cjs$'

const jestConfig = async (): Promise<Config> => {
  const resolved = await createJestConfig(config)()
  return {
    ...resolved,
    transform: {
      ...resolved.transform,
      [PGLITE_CJS]: '<rootDir>/src/test/jest/dynamicImportToRequire.cjs',
    },
    transformIgnorePatterns: (resolved.transformIgnorePatterns ?? []).map((pattern) =>
      pattern.replace('/node_modules/', '/node_modules/(?!@electric-sql/pglite/)'),
    ),
  }
}

export default jestConfig

