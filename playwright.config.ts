import { defineConfig } from '@playwright/test'

const port = Number(process.env.FIXTURE_PORT || 4180)
export default defineConfig({
	testDir: './e2e',
	testMatch: '**/*.spec.ts',
	fullyParallel: false,
	workers: 1,
	use: { baseURL: `http://127.0.0.1:${port}`, headless: true },
	webServer: {
		command: 'bun e2e/fixture.ts',
		env: { FIXTURE_PORT: String(port), FIXTURE_SOCKET: '1' },
		url: `http://127.0.0.1:${port}/health`,
		reuseExistingServer: false,
		timeout: 30000,
	},
})
