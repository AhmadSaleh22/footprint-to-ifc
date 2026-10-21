import { defineConfig, devices } from '@playwright/test'

// Software WebGL (SwiftShader) so headless Chromium works without a GPU, on CI and locally.
const launchOptions = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:5174' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions } }],
  webServer: {
    command: 'pnpm dev --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
  },
})
