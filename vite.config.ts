import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	base: './',
	plugins: [
		tanstackRouter({ target: 'react', autoCodeSplitting: true }),
		react(),
		tailwindcss(),
	],
	resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
	server: {
		proxy: process.env.ABS_PROXY_TARGET
			? {
					'/api': process.env.ABS_PROXY_TARGET,
					'/login': process.env.ABS_PROXY_TARGET,
					'/logout': process.env.ABS_PROXY_TARGET,
					'/status': process.env.ABS_PROXY_TARGET,
					'/auth': process.env.ABS_PROXY_TARGET,
					'/socket.io': { target: process.env.ABS_PROXY_TARGET, ws: true },
				}
			: undefined,
	},
	test: {
		environment: 'jsdom',
		setupFiles: ['./src/test-setup.ts'],
		include: ['src/**/*.test.{ts,tsx}'],
		restoreMocks: true,
	},
})
