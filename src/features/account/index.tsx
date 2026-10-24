import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { type AuthUser, api, logout, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { NativeSelect } from '../../shared/components/ui/native-select'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '../../shared/components/ui/table'
import { dateTime } from '../../shared/date-time'
import { setLanguage as changeLanguage, getLanguage, useT } from '../i18n'

const sessionsSchema = z.object({
	sessions: z.array(
		z.object({
			id: z.string(),
			ipAddress: z.string().nullish(),
			userAgent: z.string().nullish(),
			deviceInfo: z
				.object({
					model: z.string().nullish(),
					osName: z.string().nullish(),
					osVersion: z.string().nullish(),
					browserName: z.string().nullish(),
				})
				.nullish(),
			updatedAt: z.number().nullish(),
			current: z.boolean().optional(),
		}),
	),
	page: z.number(),
	numPages: z.number(),
})
const devicesSchema = z.object({
	ereaderDevices: z.array(
		z.object({
			name: z.string(),
			email: z.string(),
			availabilityOption: z.string().optional(),
			users: z.array(z.string()).optional(),
		}),
	),
})
const okSchema = z.object({}).passthrough()
const authorizeSchema = z.object({
	ereaderDevices: devicesSchema.shape.ereaderDevices,
})
const languages = {
	ar: 'عربي',
	be: 'Беларуская',
	bg: 'Български',
	bn: 'বাংলা',
	ca: 'Català',
	cs: 'Čeština',
	da: 'Dansk',
	de: 'Deutsch',
	'en-us': 'English',
	es: 'Español',
	et: 'Eesti',
	fi: 'Suomi',
	fr: 'Français',
	he: 'עברית',
	hr: 'Hrvatski',
	it: 'Italiano',
	ja: '日本語',
	lt: 'Lietuvių',
	hu: 'Magyar',
	ko: '한국어',
	nl: 'Nederlands',
	no: 'Norsk',
	pl: 'Polski',
	'pt-br': 'Português (Brasil)',
	ru: 'Русский',
	sk: 'Slovenčina',
	sl: 'Slovenščina',
	sv: 'Svenska',
	tr: 'Türkçe',
	uk: 'Українська',
	'vi-vn': 'Tiếng Việt',
	'zh-cn': '简体中文 (Simplified Chinese)',
	'zh-tw': '正體中文 (Traditional Chinese)',
}
type Device = z.infer<typeof devicesSchema>['ereaderDevices'][number]
function errorText(error: unknown) {
	return error instanceof Error ? error.message : 'Request failed'
}
function sessionName(
	session: z.infer<typeof sessionsSchema>['sessions'][number],
) {
	const info = session.deviceInfo
	return info
		? [
				info.model,
				info.osName &&
					`${info.osName}${info.osVersion ? ` ${info.osVersion}` : ''}`,
				info.browserName,
			]
				.filter(Boolean)
				.join(' / ') ||
				session.userAgent ||
				'-'
		: session.userAgent || '-'
}
export function Account() {
	const userId = useAuth((state) => state.user?.id)
	return <AccountSession key={userId || 'signed-out'} />
}
function AccountSession() {
	const active = useRef(true)
	useEffect(() => {
		active.current = true
		return () => {
			active.current = false
		}
	}, [])
	const t = useT()
	const user = useAuth((state) => state.user) as
		| (AuthUser & { type?: string; permissions?: { createEreader?: boolean } })
		| null
	const methods = useAuth((state) => state.authMethods)
	const [language, setLanguage] = useState(
		localStorage.getItem('lang') || getLanguage(),
	)
	const [devicesLoaded, setDevicesLoaded] = useState(false)
	const [password, setPassword] = useState(''),
		[newPassword, setNewPassword] = useState(''),
		[confirm, setConfirm] = useState('')
	const [busy, setBusy] = useState(''),
		[error, setError] = useState(''),
		[success, setSuccess] = useState('')
	const [sessions, setSessions] = useState<
			z.infer<typeof sessionsSchema>['sessions']
		>([]),
		[page, setPage] = useState(0),
		[pages, setPages] = useState(0),
		[sessionError, setSessionError] = useState('')
	const [devices, setDevices] = useState<Device[]>([]),
		[deviceName, setDeviceName] = useState(''),
		[deviceEmail, setDeviceEmail] = useState(''),
		[editing, setEditing] = useState<string | null>(null)
	const guest = user?.type === 'guest',
		root = user?.type === 'root'
	const canDevices =
		!!user?.permissions?.createEreader &&
		!['root', 'admin'].includes(user?.type || '')
	const loadSessions = async (next = page) => {
		setBusy('sessions')
		setSessionError('')
		try {
			const result = await api(
				`/me/sessions?page=${next}&itemsPerPage=10`,
				sessionsSchema,
			)
			setSessions(result.sessions)
			setPage(result.page)
			setPages(result.numPages)
		} catch (e) {
			setSessionError(errorText(e))
		} finally {
			setBusy('')
		}
	}
	useEffect(() => {
		if (guest) return
		let active = true
		setBusy('sessions')
		void api('/me/sessions?page=0&itemsPerPage=10', sessionsSchema)
			.then((result) => {
				if (active) {
					setSessions(result.sessions)
					setPage(result.page)
					setPages(result.numPages)
				}
			})
			.catch((e) => {
				if (active) setSessionError(errorText(e))
			})
			.finally(() => {
				if (active) setBusy('')
			})
		return () => {
			active = false
		}
	}, [guest])
	useEffect(() => {
		if (!canDevices) return
		let active = true
		void api('/authorize', authorizeSchema, { method: 'POST' })
			.then((result) => {
				if (active) {
					setDevices(result.ereaderDevices)
					setDevicesLoaded(true)
				}
			})
			.catch((e) => {
				if (active) {
					setError(errorText(e))
					setDevicesLoaded(false)
				}
			})
		return () => {
			active = false
		}
	}, [canDevices])
	useEffect(() => {
		setLanguage(localStorage.getItem('lang') || getLanguage())
	}, [])
	const submitPassword = async (event: React.FormEvent) => {
		event.preventDefault()
		setError('')
		setSuccess('')
		if (newPassword !== confirm) {
			setError('New passwords do not match')
			return
		}
		if (!root && password === newPassword) {
			setError('New password must differ from current password')
			return
		}
		setBusy('password')
		try {
			await api('/me/password', okSchema, {
				method: 'PATCH',
				body: JSON.stringify({ password, newPassword }),
			})
			if (!active.current) return
			setPassword('')
			setNewPassword('')
			setConfirm('')
			setSuccess('Password changed successfully')
		} catch (e) {
			setError(errorText(e))
		} finally {
			setBusy('')
		}
	}
	const saveDevices = async (next: Device[]) => {
		if (!active.current || !devicesLoaded) {
			setError('E-reader devices are not loaded; refusing to replace them')
			return
		}
		setBusy('device')
		setError('')
		setSuccess('')
		try {
			const result = await api('/me/ereader-devices', devicesSchema, {
				method: 'POST',
				body: JSON.stringify({
					ereaderDevices: next.filter(
						(device) =>
							device.users?.length === 1 && device.users[0] === user?.id,
					),
				}),
			})
			if (!active.current) return
			setDevices(result.ereaderDevices)
			setEditing(null)
			setDeviceName('')
			setDeviceEmail('')
			setSuccess('Device saved')
		} catch (e) {
			setError(errorText(e))
		} finally {
			setBusy('')
		}
	}
	const startDevice = (device?: Device) => {
		setEditing(device?.name ?? '')
		setDeviceName(device?.name ?? '')
		setDeviceEmail(device?.email ?? '')
	}
	const submitDevice = (event: React.FormEvent) => {
		event.preventDefault()
		const name = deviceName.trim(),
			email = deviceEmail.trim()
		if (!name || !email) {
			setError('Name and email required')
			return
		}
		if (devices.some((d) => d.name === name && d.name !== editing)) {
			setError('Device name already exists')
			return
		}
		if (!user) return
		const next = devices.filter((d) => d.name !== editing)
		next.push({
			...(devices.find((d) => d.name === editing) ?? {}),
			name,
			email,
			availabilityOption: 'specificUsers',
			users: [user.id],
		})
		void saveDevices(next)
	}
	const signOut = async (allDevices = false) => {
		setBusy('logout')
		setError('')
		try {
			await logout(allDevices)
		} catch (cause) {
			setError(errorText(cause))
		} finally {
			setBusy('')
		}
	}
	const deleteSession = async (id: string, current?: boolean) => {
		if (!window.confirm('Sign out this device?')) return
		if (current) {
			await signOut()
			return
		}
		setBusy(id)
		try {
			await api(`/me/sessions/${encodeURIComponent(id)}`, okSchema, {
				method: 'DELETE',
			})
			await loadSessions(sessions.length === 1 && page > 0 ? page - 1 : page)
		} catch (e) {
			setError(errorText(e))
		} finally {
			setBusy('')
		}
	}
	return (
		<section className="mx-auto max-w-2xl space-y-6">
			<h2 className="text-xl font-semibold">{t('HeaderAccount')}</h2>
			<div className="grid grid-cols-3 gap-3">
				<Label className="col-span-2 block">
					{t('LabelUsername')}
					<Input disabled value={user?.username ?? ''} className="mt-1" />
				</Label>
				<Label className="block">
					{t('LabelAccountType')}
					<Input disabled value={user?.type ?? ''} className="mt-1" />
				</Label>
			</div>
			<Label className="block">
				{t('LabelLanguage')}
				<NativeSelect
					className="mt-1"
					value={language}
					onChange={(e) => {
						void changeLanguage(e.target.value)
							.then(() => setLanguage(getLanguage()))
							.catch((cause: unknown) => setError(errorText(cause)))
					}}
				>
					{Object.entries(languages).map(([key, label]) => (
						<option key={key} value={key}>
							{label}
						</option>
					))}
				</NativeSelect>
			</Label>
			{!guest && methods.includes('local') && (
				<form onSubmit={submitPassword} className="space-y-3 border-t pt-5">
					<h2 className="text-lg font-medium">Change password</h2>
					{[
						['Current password', password, setPassword],
						['New password', newPassword, setNewPassword],
						['Confirm password', confirm, setConfirm],
					].map(([label, value, setter]) => (
						<Label key={label as string} className="block">
							{label as string}
							<Input
								disabled={!!busy}
								type="password"
								autoComplete="current-password"
								className="mt-1"
								value={value as string}
								onChange={(e) =>
									(setter as (v: string) => void)(e.target.value)
								}
							/>
						</Label>
					))}
					{root && (
						<p className="text-sm text-destructive">
							Root password changes invalidate all sessions.
						</p>
					)}
					<Button disabled={!!busy}>Change password</Button>
				</form>
			)}
			{canDevices && (
				<section className="border-t pt-5">
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-medium">E-reader devices</h2>
						<Button
							disabled={!devicesLoaded || !!busy}
							onClick={() => startDevice()}
						>
							Add device
						</Button>
					</div>
					{devices.length ? (
						<ul className="divide-y">
							{devices.map((d) => (
								<li key={d.name} className="flex justify-between py-3">
									<span>
										{d.name} · {d.email}
									</span>
									<span className="flex gap-2">
										<Button
											variant="outline"
											disabled={d.users?.length !== 1 || busy === 'device'}
											onClick={() => startDevice(d)}
										>
											Edit
										</Button>
										<Button
											variant="outline"
											disabled={d.users?.length !== 1 || busy === 'device'}
											onClick={() =>
												window.confirm(`Delete ${d.name}?`) &&
												void saveDevices(
													devices.filter((x) => x.name !== d.name),
												)
											}
										>
											Delete
										</Button>
									</span>
								</li>
							))}
						</ul>
					) : (
						<p className="py-4 text-center">No devices</p>
					)}
					{editing !== null && (
						<form
							className="mt-4 space-y-3 border-t pt-4"
							onSubmit={submitDevice}
						>
							<h3>{editing ? 'Update device' : 'Create device'}</h3>
							<Label className="block">
								Name
								<Input
									required
									className="mt-1"
									value={deviceName}
									onChange={(e) => setDeviceName(e.target.value)}
								/>
							</Label>
							<Label className="block">
								Email
								<Input
									required
									type="email"
									className="mt-1 w-full rounded-md border bg-background p-2"
									value={deviceEmail}
									onChange={(e) => setDeviceEmail(e.target.value)}
								/>
							</Label>
							<Button disabled={!!busy}>Save device</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() => setEditing(null)}
							>
								Cancel
							</Button>
						</form>
					)}
				</section>
			)}
			{!guest && (
				<section className="border-t pt-5">
					<h2 className="text-lg font-medium">Sessions</h2>
					{busy === 'sessions' && <p role="status">Loading sessions…</p>}
					{sessionError && <p role="alert">{sessionError}</p>}
					{sessions.length > 0 && (
						<div className="overflow-x-auto">
							<Table className="w-full text-left">
								<TableHeader>
									<TableRow>
										<TableHead>Device</TableHead>
										<TableHead className="hidden sm:table-cell">
											IP address
										</TableHead>
										<TableHead>Last update</TableHead>
										<TableHead />
									</TableRow>
								</TableHeader>
								<TableBody>
									{sessions.map((s) => (
										<TableRow key={s.id} className="border-t">
											<TableCell>
												{sessionName(s)}{' '}
												{s.current && (
													<span className="text-green-600">Current</span>
												)}
											</TableCell>
											<TableCell className="hidden sm:table-cell">
												{s.ipAddress || '-'}
											</TableCell>
											<TableCell>
												{s.updatedAt
													? dateTime(s.updatedAt).replace('T', ' ').slice(0, 16)
													: '-'}
											</TableCell>
											<TableCell>
												<Button
													variant="outline"
													disabled={busy === s.id || busy === 'sessions'}
													onClick={() => void deleteSession(s.id, s.current)}
												>
													Sign out
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
					{!sessions.length && busy !== 'sessions' && !sessionError && (
						<p className="py-4 text-center">No active sessions</p>
					)}
					{pages > 1 && (
						<div className="flex justify-end gap-3 py-2">
							<Button
								variant="outline"
								disabled={busy === 'sessions' || page === 0}
								onClick={() => void loadSessions(page - 1)}
							>
								Previous
							</Button>
							<span>
								Page {page + 1} of {pages}
							</span>
							<Button
								variant="outline"
								disabled={busy === 'sessions' || page >= pages - 1}
								onClick={() => void loadSessions(page + 1)}
							>
								Next
							</Button>
						</div>
					)}
				</section>
			)}
			{(error || success) && (
				<p
					role={error ? 'alert' : 'status'}
					className={error ? 'text-destructive' : 'text-green-600'}
				>
					{error || success}
				</p>
			)}
			<div className="flex flex-wrap gap-3 border-t pt-5">
				{!guest && (
					<Button
						variant="outline"
						disabled={!!busy}
						onClick={() => {
							if (window.confirm('Sign out all devices?')) void signOut(true)
						}}
					>
						Sign out all devices
					</Button>
				)}
				<Button
					variant="outline"
					disabled={!!busy}
					onClick={() => void signOut()}
				>
					Sign out
				</Button>
			</div>
		</section>
	)
}
