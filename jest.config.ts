import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  dir: './',
})

const config: Config = {
  coverageProvider: 'v8',
  preset: 'ts-jest',
  testEnvironment: 'jest-fixed-jsdom',
  roots: ['<rootDir>'],
  moduleNameMapper: {
    "^singleton$": "<rootDir>/utils/singleton.ts",
    "^utils$": "<rootDir>/utils/*"
  },
  setupFilesAfterEnv: ['<rootDir>/utils/singleton.ts', '<rootDir>/utils/setupTests.ts'],
  clearMocks: true,
}

export default createJestConfig(config)

