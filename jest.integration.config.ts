import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  dir: './',
})

// Integration tests run real tRPC procedures against a real Postgres database.
// They live in `*.integration.test.ts` files and are kept out of `npm test`
// (see jest.config.ts) so unit tests stay DB-free.
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.integration.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/e2e/'],
  globalSetup: '<rootDir>/src/test/integration/globalSetup.ts',
  setupFilesAfterEnv: ['<rootDir>/src/test/integration/setup.ts'],
  // Every test file shares one database, so run them one at a time.
  maxWorkers: 1,
}

export default createJestConfig(config)
