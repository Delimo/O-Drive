export default {
  testDir: './tests/browser',
  timeout: 30000,
  use: {
    baseURL: process.env.ODRIVE_BASE_URL || 'http://127.0.0.1:8788',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/helpers/static-server.mjs',
    port: 8788,
    timeout: 10000,
    reuseExistingServer: true,
  },
};
