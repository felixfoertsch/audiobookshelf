import { beforeEach } from 'vitest'

// jsdom has no layout; Radix observes sizes in browsers.
beforeEach(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
})
