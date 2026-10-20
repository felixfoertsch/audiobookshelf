import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { NativeSelect } from '../../shared/components/ui/native-select'
import { setServerLanguage, useT } from '../i18n'

const settingsSchema = z.object({
	version: z.string().nullish(),
	buildNumber: z.number().optional(),
	storeCoverWithItem: z.boolean(),
	storeMetadataWithItem: z.boolean(),
	sortingIgnorePrefix: z.boolean(),
	sortingPrefixes: z.array(z.string()),
	scannerParseSubtitle: z.boolean(),
	scannerFindCovers: z.boolean(),
	scannerCoverProvider: z.string(),
	scannerPreferMatchedMetadata: z.boolean(),
	scannerDisableWatcher: z.boolean(),
	chromecastEnabled: z.boolean(),
	allowIframe: z.boolean(),
	homeBookshelfView: z.number(),
	bookshelfView: z.number(),
	dateFormat: z.string(),
	timeFormat: z.string(),
	language: z.string(),
	allowedOrigins: z.array(z.string()),
})
type Settings = z.infer<typeof settingsSchema>
const response = z.object({ serverSettings: settingsSchema })
const prefixResponse = z.object({ rowsUpdated: z.number().int().nonnegative() })
const toggles = [
	['storeCoverWithItem', 'Store covers with item'],
	['storeMetadataWithItem', 'Store metadata with item'],
	['sortingIgnorePrefix', 'Ignore prefixes when sorting'],
	['scannerParseSubtitle', 'Parse subtitles'],
	['scannerFindCovers', 'Find covers'],
	['scannerPreferMatchedMetadata', 'Prefer matched metadata'],
	['chromecastEnabled', 'Chromecast support'],
	['allowIframe', 'Allow iframe embedding'],
] as const
export function normalizePrefixes(value: string) {
	return [
		...new Set(
			value
				.split('\n')
				.map((entry) => entry.trim().toLowerCase())
				.filter(Boolean),
		),
	]
}
export function validateOrigins(value: string) {
	return value
		.split('\n')
		.map((entry) => entry.trim().toLowerCase())
		.filter(Boolean)
		.map((entry) => {
			new URL(entry)
			return entry
		})
}
const languages = [
	['ar', 'عربي'],
	['be', 'Беларуская'],
	['bg', 'Български'],
	['bn', 'বাংলা'],
	['ca', 'Català'],
	['cs', 'Čeština'],
	['da', 'Dansk'],
	['de', 'Deutsch'],
	['en-us', 'English'],
	['es', 'Español'],
	['et', 'Eesti'],
	['fi', 'Suomi'],
	['fr', 'Français'],
	['he', 'עברית'],
	['hr', 'Hrvatski'],
	['it', 'Italiano'],
	['ja', '日本語'],
	['lt', 'Lietuvių'],
	['hu', 'Magyar'],
	['ko', '한국어'],
	['nl', 'Nederlands'],
	['no', 'Norsk'],
	['pl', 'Polski'],
	['pt-br', 'Português (Brasil)'],
	['ru', 'Русский'],
	['sk', 'Slovenčina'],
	['sl', 'Slovenščina'],
	['sv', 'Svenska'],
	['tr', 'Türkçe'],
	['uk', 'Українська'],
	['vi-vn', 'Tiếng Việt'],
	['zh-cn', '简体中文'],
	['zh-tw', '正體中文'],
] as const
const labelKeys: Record<string, string> = {
	'Store covers with item': 'LabelSettingsStoreCoversWithItem',
	'Store metadata with item': 'LabelSettingsStoreMetadataWithItem',
	'Parse subtitles': 'LabelSettingsParseSubtitles',
	'Find covers': 'LabelSettingsFindCovers',
	'Prefer matched metadata': 'LabelSettingsPreferMatchedMetadata',
}
export function SettingsPage() {
	const user = useAuth((state) => state.user)
	return <SettingsForm key={`${user?.id ?? ''}:${user?.type ?? ''}`} />
}
function SettingsForm() {
	const t = useT()
	const saving = useRef(false)
	const help = (key: string) => t(key).replace(/<[^>]*>/g, ' ')
	const user = useAuth((state) => state.user)
	const mounted = useRef(true)
	useEffect(() => {
		mounted.current = true
		return () => {
			mounted.current = false
		}
	}, [])
	const identity = `${user?.id ?? ''}:${user?.type ?? ''}`
	const current = () =>
		mounted.current &&
		`${useAuth.getState().user?.id ?? ''}:${useAuth.getState().user?.type ?? ''}` ===
			identity
	const allowed = user?.type === 'root' || user?.type === 'admin'
	const [settings, setSettings] = useState<Settings | null>(null)
	const [providers, setProviders] = useState<{ text: string; value: string }[]>(
		[],
	)
	const [prefixes, setPrefixes] = useState('')
	const [origins, setOrigins] = useState('')
	const [pending, setPending] = useState(false)
	const [message, setMessage] = useState('')
	const [errorMessage, setErrorMessage] = useState('')
	// biome-ignore lint/correctness/useExhaustiveDependencies: initial load belongs to identity-keyed form lifetime
	useEffect(() => {
		if (!allowed) return
		let active = true
		Promise.all([
			api('/authorize', response, { method: 'POST' }),
			api(
				'/search/providers',
				z.object({
					providers: z.object({
						booksCovers: z.array(
							z.object({ text: z.string(), value: z.string() }),
						),
					}),
				}),
			),
		])
			.then(([data, list]) => {
				if (!active || !current()) return
				setSettings(data.serverSettings)
				setPrefixes(data.serverSettings.sortingPrefixes.join('\n'))
				setOrigins(data.serverSettings.allowedOrigins.join('\n'))
				setProviders(list.providers.booksCovers)
			})
			.catch(
				() =>
					active &&
					current() &&
					setErrorMessage('Failed to load settings. Retry this page.'),
			)
		return () => {
			active = false
		}
	}, [allowed, user?.id, user?.type])
	async function update(payload: Partial<Settings>, path = '/settings') {
		if (saving.current || !allowed || !current()) return
		saving.current = true

		setPending(true)
		setMessage('')
		setErrorMessage('')
		try {
			if (path === '/sorting-prefixes') {
				const data = await api(path, prefixResponse, {
					method: 'PATCH',
					body: JSON.stringify(payload),
				})
				if (!current()) return
				if ('sortingPrefixes' in payload && payload.sortingPrefixes) {
					const sortingPrefixes = payload.sortingPrefixes
					setSettings((current) => current && { ...current, sortingPrefixes })
				}
				setMessage(t('ToastSortingPrefixesUpdateSuccess', [data.rowsUpdated]))
				return
			}
			const data = await api(path, response, {
				method: 'PATCH',
				body: JSON.stringify(payload),
			})
			if (!current()) return
			setSettings(data.serverSettings)
			if (payload.language) {
				await setServerLanguage(data.serverSettings.language)
				if (!current()) return
			}
			setMessage('Settings saved.')
		} catch (error) {
			if (current())
				setErrorMessage(error instanceof Error ? error.message : 'Save failed.')
		} finally {
			if (current()) {
				saving.current = false
				setPending(false)
			}
		}
	}
	async function purge(items: boolean) {
		if (saving.current || !allowed || !current()) return
		if (
			!window.confirm(
				items
					? 'Purge all cached item data? Cached data will be rebuilt.'
					: 'Purge all cache, including transcoded audio and covers? Active playback may be interrupted.',
			)
		)
			return
		saving.current = true

		setPending(true)
		setErrorMessage('')
		setMessage('')
		try {
			await api(items ? '/cache/items/purge' : '/cache/purge', z.unknown(), {
				method: 'POST',
			})
			if (current()) setMessage('Cache purged.')
		} catch (error) {
			if (current())
				setErrorMessage(
					error instanceof Error ? error.message : 'Purge failed.',
				)
		} finally {
			if (current()) {
				saving.current = false
				setPending(false)
			}
		}
	}
	const prefixSet = (values: string[]) =>
		JSON.stringify([...new Set(values)].sort())
	const prefixesChanged =
		settings !== null &&
		prefixSet(normalizePrefixes(prefixes)) !==
			prefixSet(normalizePrefixes(settings.sortingPrefixes.join('\n')))
	if (!allowed) return <p role="alert">Administrator access required.</p>
	return (
		<section className="space-y-5">
			<h1 className="text-2xl font-semibold">Server settings</h1>
			<p role="status">{message || (!settings ? 'Loading settings…' : '')}</p>
			{errorMessage && <p role="alert">{errorMessage}</p>}
			{settings && (
				<fieldset disabled={pending} className="space-y-4">
					<legend>General, scanner and web client</legend>
					{toggles.map(([key, label]) => (
						<label className="flex items-center gap-3" key={key}>
							<input
								aria-label={t(labelKeys[label] ?? label)}
								type="checkbox"
								checked={settings[key]}
								onChange={(event) =>
									void update({ [key]: event.target.checked })
								}
							/>
							{t(labelKeys[label] ?? label)}
							{key === 'storeCoverWithItem' && (
								<span className="block text-sm text-muted-foreground">
									{help('LabelSettingsStoreCoversWithItemHelp')}
								</span>
							)}
							{key === 'storeMetadataWithItem' && (
								<span className="block text-sm text-muted-foreground">
									{help('LabelSettingsStoreMetadataWithItemHelp')}
								</span>
							)}
							{key === 'sortingIgnorePrefix' && (
								<span className="block text-sm text-muted-foreground">
									{help('LabelSettingsSortingIgnorePrefixesHelp')}
								</span>
							)}
							{key === 'scannerParseSubtitle' && (
								<span className="block text-sm text-muted-foreground">
									{help('LabelSettingsParseSubtitlesHelp')}
								</span>
							)}
							{key === 'scannerFindCovers' && (
								<span className="block text-sm text-muted-foreground">
									{help('LabelSettingsFindCoversHelp')}
								</span>
							)}
							{key === 'scannerPreferMatchedMetadata' && (
								<span className="block text-sm text-muted-foreground">
									{help('LabelSettingsPreferMatchedMetadataHelp')}
								</span>
							)}
						</label>
					))}
					{settings.sortingIgnorePrefix && (
						<form
							className="space-y-2"
							onSubmit={(event) => {
								event.preventDefault()
								const values = normalizePrefixes(prefixes)
								if (!values.length) {
									setErrorMessage('At least one sorting prefix required.')
									return
								}
								if (prefixesChanged)
									void update({ sortingPrefixes: values }, '/sorting-prefixes')
							}}
						>
							<label className="block">
								Prefixes to ignore (one per line)
								<textarea
									className="block w-full rounded border bg-background p-2"
									value={prefixes}
									onChange={(event) => setPrefixes(event.target.value)}
								/>
							</label>
							{prefixesChanged && <Button>Save prefixes</Button>}
						</form>
					)}
					{settings.scannerFindCovers && (
						<label className="block" htmlFor="scannerCoverProvider">
							Cover provider
							<NativeSelect
								id="scannerCoverProvider"
								className="block rounded border bg-background p-2"
								value={settings.scannerCoverProvider}
								onChange={(event) =>
									void update({ scannerCoverProvider: event.target.value })
								}
							>
								{providers.map((provider) => (
									<option key={provider.value} value={provider.value}>
										{provider.text}
									</option>
								))}
							</NativeSelect>
						</label>
					)}
					<label className="flex items-center gap-3">
						<input
							aria-label="Enable filesystem watcher"
							type="checkbox"
							checked={!settings.scannerDisableWatcher}
							onChange={(event) =>
								void update({ scannerDisableWatcher: !event.target.checked })
							}
						/>
						Enable filesystem watcher
						<span className="block text-sm text-muted-foreground">
							{help('LabelSettingsEnableWatcherHelp')}
						</span>
					</label>
					<h2 className="text-lg font-semibold">
						{t('HeaderSettingsDisplay')}
					</h2>
					{(['homeBookshelfView', 'bookshelfView'] as const).map((key) => (
						<label key={key} className="flex items-center gap-3">
							<input
								type="checkbox"
								checked={settings[key] !== 1}
								onChange={(event) =>
									void update({ [key]: event.target.checked ? 0 : 1 })
								}
							/>
							{key === 'homeBookshelfView'
								? 'Home page bookshelf view'
								: 'Library bookshelf view'}
							<span className="block text-sm text-muted-foreground">
								{help('LabelSettingsBookshelfViewHelp')}
							</span>
						</label>
					))}
					<label className="block" htmlFor="dateFormat">
						Server date format
						<NativeSelect
							id="dateFormat"
							className="block rounded border bg-background p-2"
							value={settings.dateFormat}
							onChange={(event) =>
								void update({ dateFormat: event.target.value })
							}
						>
							{[
								'MM/dd/yyyy',
								'dd/MM/yyyy',
								'dd.MM.yyyy',
								'yyyy-MM-dd',
								'MMM do, yyyy',
								'MMMM do, yyyy',
								'dd MMM yyyy',
								'dd MMMM yyyy',
							].map((value) => (
								<option key={value}>{value}</option>
							))}
						</NativeSelect>
					</label>
					<p>
						Example:{' '}
						{
							(
								{
									'MM/dd/yyyy': '01/23/2000',
									'dd/MM/yyyy': '23/01/2000',
									'dd.MM.yyyy': '23.01.2000',
									'yyyy-MM-dd': '2000-01-23',
									'MMM do, yyyy': 'Jan 23rd, 2000',
									'MMMM do, yyyy': 'January 23rd, 2000',
									'dd MMM yyyy': '23 Jan 2000',
									'dd MMMM yyyy': '23 January 2000',
								} as Record<string, string>
							)[settings.dateFormat]
						}
					</p>
					<label className="block" htmlFor="timeFormat">
						Server time format
						<NativeSelect
							id="timeFormat"
							className="block rounded border bg-background p-2"
							value={settings.timeFormat}
							onChange={(event) =>
								void update({ timeFormat: event.target.value })
							}
						>
							<option value="h:mma">h:mma</option>
							<option value="HH:mm">HH:mm</option>
						</NativeSelect>
					</label>
					<p>
						Example: {settings.timeFormat === 'HH:mm' ? '13:45' : '1:45 PM'}.
						Modern client displays ISO 8601 dates and 24-hour time. Server
						preferences remain available for other clients.
					</p>
					<label className="block" htmlFor="language">
						Default server language
						<NativeSelect
							id="language"
							className="block rounded border bg-background p-2"
							value={settings.language}
							onChange={(event) =>
								void update({ language: event.target.value })
							}
						>
							{languages.map(([code, label]) => (
								<option key={code} value={code}>
									{t(labelKeys[label] ?? label)}
								</option>
							))}
						</NativeSelect>
					</label>
					<form
						className="space-y-2"
						onSubmit={(event) => {
							event.preventDefault()
							try {
								void update({ allowedOrigins: validateOrigins(origins) })
							} catch {
								setErrorMessage('Every allowed origin must be a valid URL.')
							}
						}}
					>
						<label className="block">
							CORS allowed origins (one URL per line)
							<textarea
								className="block w-full rounded border bg-background p-2"
								value={origins}
								onChange={(event) => setOrigins(event.target.value)}
							/>
						</label>
						<Button>Save allowed origins</Button>
					</form>
					<div className="flex flex-wrap gap-2">
						<Button variant="destructive" onClick={() => void purge(false)}>
							Purge all cache
						</Button>
						<Button variant="outline" onClick={() => void purge(true)}>
							Purge items cache
						</Button>
					</div>
				</fieldset>
			)}
			{settings?.version && (
				<p>
					Server version: {settings.version}
					{settings.buildNumber ? ` (build ${settings.buildNumber})` : ''}
				</p>
			)}
			<p className="flex gap-4">
				<a
					href="https://github.com/advplyr/audiobookshelf"
					target="_blank"
					rel="noreferrer"
				>
					Report bugs and contribute
				</a>
				<a
					href="https://discord.gg/HQgCbd6E75"
					target="_blank"
					rel="noreferrer"
				>
					Join Discord
				</a>
			</p>
		</section>
	)
}
