import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	getLanguage,
	setLanguage,
	setServerLanguage,
	translate,
	useT,
} from './index'

afterEach(async () => {
	cleanup()
	localStorage.clear()
	await setLanguage('en-us', false)
})
describe('native language strings', () => {
	it('loads selected language, rerenders subscribers, and preserves local precedence', async () => {
		function Heading() {
			const t = useT()
			return <h1>{t('HeaderAccount')}</h1>
		}
		render(<Heading />)
		await act(() => setLanguage('de'))
		expect(getLanguage()).toBe('de')
		expect(localStorage.getItem('lang')).toBe('de')
		expect(screen.getByRole('heading').textContent).not.toBe('Account')
		await setServerLanguage('fr')
		expect(getLanguage()).toBe('de')
		await setServerLanguage('en-us')
		expect(getLanguage()).toBe('de')
	})
	it('falls back unsupported code and missing keys without dropping text', async () => {
		await setLanguage('unsupported')
		expect(getLanguage()).toBe('en-us')
		expect(translate('NotYetTranslated', [], 'Readable fallback')).toBe(
			'Readable fallback',
		)
	})
	it('restores saved language after module reload', async () => {
		localStorage.setItem('lang', 'de')
		vi.resetModules()
		const reloaded = await import('./index')
		await reloaded.setServerLanguage('fr')
		expect(reloaded.getLanguage()).toBe('de')
	})
})
