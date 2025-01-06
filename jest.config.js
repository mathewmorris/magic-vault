module.exports = {
  clearMocks: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  moduleNameMapper: {
    "^singleton$": "<rootDir>/singleton.ts"
  },
  setupFilesAfterEnv: ['<rootDir>/singleton.ts'],
};

