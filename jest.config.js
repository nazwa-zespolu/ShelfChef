const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts", "<rootDir>/tests/**/*.test.tsx"],
  moduleNameMapper: {
    "^@env$": "<rootDir>/src/__mocks__/env.ts",
  },
  transform: {
    ...tsJestTransformCfg,
  },
};
