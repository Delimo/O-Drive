export default {
  testDir: './tests/browser',
  timeout: 30000,
  globalSetup: './tests/helpers/playwright-global-setup.mjs',
  use: {
    baseURL: process.env.ODRIVE_BASE_URL || 'http://127.0.0.1:8788',
    trace: 'retain-on-failure',
  },
};
