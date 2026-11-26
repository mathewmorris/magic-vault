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
    "^singleton$": "<rootDir>/singleton.ts"
  },
  setupFilesAfterEnv: ['<rootDir>/singleton.ts'],
  clearMocks: true,
}

export default createJestConfig(config)

