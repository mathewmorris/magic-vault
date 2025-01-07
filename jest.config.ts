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
  moduleNameMapper: {
    "^singleton$": "<rootDir>/singleton.ts"
  },
  setupFilesAfterEnv: ['<rootDir>/singleton.ts'],
  clearMocks: true,
}

export default createJestConfig(config)

