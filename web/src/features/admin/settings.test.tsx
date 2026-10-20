import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../api'
import { getLanguage, setServerLanguage } from '../i18n'
import { normalizePrefixes, SettingsPage, validateOrigins } from './settings'

vi.mock('../../api', async () => {
	const actual = await vi.importActual<typeof import('../../api')>('../../api')
	return { ...actual, api: vi.fn() }
})
vi.mock('../i18n', async () => {
	const actual = await vi.importActual<typeof import('../i18n')>('../i18n')
	return { ...actual, setServerLanguage: vi.fn(actual.setServerLanguage) }
})
const settings = {
	version: '1',
	storeCoverWithItem: false,
	storeMetadataWithItem: false,
	sortingIgnorePrefix: true,
	sortingPrefixes: ['the', 'a'],
	scannerParseSubtitle: false,
	scannerFindCovers: false,
	scannerCoverProvider: 'google',
	scannerPreferMatchedMetadata: false,
	scannerDisableWatcher: false,
	chromecastEnabled: false,
	allowIframe: false,
	homeBookshelfView: 1,
	bookshelfView: 1,
	dateFormat: 'yyyy-MM-dd',
	timeFormat: 'HH:mm',
	language: 'en-us',
	allowedOrigins: [],
}
async function setup() {
	const { api } = await import('../../api')
	vi.mocked(api).mockImplementation(async (path) =>
		path === '/search/providers'
			? { providers: { booksCovers: [] } }
			: { serverSettings: settings },
	)
	useAuth.setState({
		user: { id: 'root', username: 'root', accessToken: 'test', type: 'root' },
	})
	render(<SettingsPage />)
	await screen.findByLabelText('Prefixes to ignore (one per line)')
	return api
}
afterEach(() => {
	cleanup()
	useAuth.setState({ user: null })
	localStorage.removeItem('lang')
	vi.clearAllMocks()
})
describe('server settings', () => {
	it('discards private drafts and ignores old language save after account switch', async () => {
		const api = await setup()
		let finish: (value: unknown) => void = () => {}
		vi.mocked(api).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve
				}),
		)
		fireEvent.change(screen.getByLabelText('Default server language'), {
			target: { value: 'fr' },
		})
		vi.mocked(api)
			.mockResolvedValueOnce({
				serverSettings: { ...settings, sortingPrefixes: ['B-only'] },
			})
			.mockResolvedValueOnce({ providers: { booksCovers: [] } })
		act(() =>
			useAuth.setState({
				user: { id: 'B', username: 'B', type: 'admin', accessToken: 'b' },
			}),
		)
		await waitFor(() =>
			expect(
				(
					screen.getByLabelText(
						'Prefixes to ignore (one per line)',
					) as HTMLTextAreaElement
				).value,
			).toBe('B-only'),
		)
		await act(async () =>
			finish({
				serverSettings: {
					...settings,
					language: 'fr',
					sortingPrefixes: ['late-A'],
				},
			}),
		)
		expect(setServerLanguage).not.toHaveBeenCalled()
		expect(
			(
				screen.getByLabelText(
					'Prefixes to ignore (one per line)',
				) as HTMLTextAreaElement
			).value,
		).toBe('B-only')
	})
	it('locks purge across duplicate clicks and shows date preference example', async () => {
		const api = await setup()
		expect(screen.getByText(/01\/23\/2000|2000-01-23/)).toBeTruthy()
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		let finish: (value: unknown) => void = () => {}
		vi.mocked(api).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve
				}),
		)
		const button = screen.getByRole('button', { name: 'Purge all cache' })
		fireEvent.click(button)
		fireEvent.click(button)
		expect(api).toHaveBeenCalledTimes(3)
		await act(async () => finish(undefined))
		await screen.findByText('Cache purged.')
	})
	it('renders real translated German controls from server language', async () => {
		await setup()
		await act(async () => setServerLanguage('de'))
		expect(
			screen.getByLabelText('Titelbilder im Medienordner speichern'),
		).toBeTruthy()
		expect(
			screen.getByLabelText(
				'Metadaten als OPF-Datei im Medienordner speichern',
			),
		).toBeTruthy()
		await act(async () => setServerLanguage('en-us'))
	})
	it('normalizes sorting prefixes as unordered set and rejects malformed origins', () => {
		expect(normalizePrefixes(' The \nA\nthe\n')).toEqual(['the', 'a'])
		expect(() => validateOrigins('not a URL')).toThrow()
		expect(validateOrigins(' HTTPS://EXAMPLE.COM \n')).toEqual([
			'https://example.com',
		])
	})
	it('does not load settings for non-admin', async () => {
		const { api } = await import('../../api')
		useAuth.setState({
			user: {
				id: 'reader',
				username: 'reader',
				accessToken: 'test',
				type: 'user',
			},
		})
		render(<SettingsPage />)
		expect(screen.getByRole('alert').textContent).toContain(
			'Administrator access required',
		)
		await waitFor(() => expect(api).not.toHaveBeenCalled())
	})
	it('patches only changed setting and reports ordinary save outcome', async () => {
		const api = await setup()
		fireEvent.click(await screen.findByLabelText('Store covers with item'))
		await waitFor(() =>
			expect(api).toHaveBeenCalledWith('/settings', expect.anything(), {
				method: 'PATCH',
				body: JSON.stringify({ storeCoverWithItem: true }),
			}),
		)
		await screen.findByText('Settings saved.')
	})
	it('shows visible native help and preserves watcher inverse request with duplicate guard', async () => {
		const api = await setup()
		expect(screen.getByText(/Only one file named/).className).not.toContain(
			'sr-only',
		)
		expect(
			screen.getByText(/This will extend scan time/).textContent,
		).not.toContain('<br>')
		expect(screen.getByText(/Requires server restart/)).toBeTruthy()
		let finish: (value: unknown) => void = () => {}
		vi.mocked(api).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve
				}),
		)
		const watcher = screen.getByLabelText('Enable filesystem watcher')
		fireEvent.click(watcher)
		fireEvent.click(watcher)
		expect(api).toHaveBeenCalledTimes(3)
		expect(api).toHaveBeenLastCalledWith('/settings', expect.anything(), {
			method: 'PATCH',
			body: JSON.stringify({ scannerDisableWatcher: true }),
		})
		finish({ serverSettings: { ...settings, scannerDisableWatcher: true } })
		await screen.findByText('Settings saved.')
		expect((watcher as HTMLInputElement).checked).toBe(false)
	})
	it('does not submit normalized prefixes when set unchanged', async () => {
		const api = await setup()
		const input = await screen.findByLabelText(
			'Prefixes to ignore (one per line)',
		)
		expect(screen.queryByRole('button', { name: 'Save prefixes' })).toBeNull()
		fireEvent.change(input, { target: { value: ' THE \na ' } })
		expect(screen.queryByRole('button', { name: 'Save prefixes' })).toBeNull()
		const form = input.closest('form')
		expect(form).not.toBeNull()
		if (form) fireEvent.submit(form)
		expect(api).not.toHaveBeenCalledWith(
			'/sorting-prefixes',
			expect.anything(),
			expect.anything(),
		)
	})
	it('sends normalized changed prefix set and reports rows updated', async () => {
		const api = await setup()
		vi.mocked(api).mockImplementation(async (path) =>
			path === '/search/providers'
				? { providers: { booksCovers: [] } }
				: path === '/sorting-prefixes'
					? { rowsUpdated: 3 }
					: { serverSettings: settings },
		)
		const input = await screen.findByLabelText(
			'Prefixes to ignore (one per line)',
		)
		fireEvent.change(input, { target: { value: ' The \nA\nTHE\nOf ' } })
		fireEvent.click(screen.getByRole('button', { name: 'Save prefixes' }))
		await waitFor(() =>
			expect(api).toHaveBeenCalledWith('/sorting-prefixes', expect.anything(), {
				method: 'PATCH',
				body: JSON.stringify({ sortingPrefixes: ['the', 'a', 'of'] }),
			}),
		)
		await screen.findByText('Sorting prefixes updated (3 items)')
	})
	it.each([
		['without local override', null, 'fr', 'fr'],
		['with local override', 'de', 'fr', 'de'],
	])(
		'applies returned language %s',
		async (_label, override, returned, expected) => {
			const api = await setup()
			if (override) localStorage.setItem('lang', override)
			vi.mocked(api).mockImplementation(async (path) =>
				path === '/search/providers'
					? { providers: { booksCovers: [] } }
					: { serverSettings: { ...settings, language: returned } },
			)
			fireEvent.change(
				await screen.findByLabelText('Default server language'),
				{
					target: { value: 'fr' },
				},
			)
			await waitFor(() =>
				expect(setServerLanguage).toHaveBeenCalledWith(returned),
			)
			await waitFor(() => expect(getLanguage()).toBe(expected))
		},
	)
	it('does not change language when language save fails', async () => {
		const api = await setup()
		localStorage.setItem('lang', 'de')
		vi.mocked(api).mockImplementation(async (path) => {
			if (path === '/search/providers')
				return { providers: { booksCovers: [] } }
			if (path === '/settings') throw new Error('save failed')
			return { serverSettings: settings }
		})
		fireEvent.change(await screen.findByLabelText('Default server language'), {
			target: { value: 'fr' },
		})
		await screen.findByText('save failed')
		expect(setServerLanguage).not.toHaveBeenCalled()
		expect(getLanguage()).toBe('de')
	})
})
