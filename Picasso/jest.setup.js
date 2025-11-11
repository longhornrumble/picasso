import '@testing-library/jest-dom';

// Mock import.meta for Jest (not supported in CommonJS)
global.import = global.import || {};
global.import.meta = {
  env: {
    DEV: false,
    PROD: false,
    MODE: 'test'
  }
};
