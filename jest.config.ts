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
  setupFilesAfterEnv: ['<rootDir>/__test__/utils/singleton.ts', '<rootDir>/__test__/utils/setupTests.ts'],
  clearMocks: true,
}

export default createJestConfig(config)

