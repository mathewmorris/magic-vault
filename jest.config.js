module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  // modulePaths: [compilerOptions.baseUrl],
  // moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths),
  moduleNameMapper: {
    '^~/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: ['node_modules/(?!(sucrase)/)'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx|mjs)$': 'babel-jest',
  },
  // setupFiles: ['<rootDir>/jest-setup.js'],
  setupFilesAfterEnv: ['<rootDir>/singleton.ts']
};

