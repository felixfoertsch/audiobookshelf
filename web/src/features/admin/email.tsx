import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'

const deviceSchema = z
	.object({
		name: z.string(),
		email: z.string(),
		availabilityOption: z.string().optional(),
		users: z.array(z.string()).optional(),
	})
	.passthrough()
const schema = z
	.object({
		settings: z
			.object({
				host: z.string().nullish(),
				port: z.number().nullish(),
				secure: z.boolean().default(false),
				rejectUnauthorized: z.boolean().default(true),
				user: z.string().nullish(),
				pass: z.string().nullish(),
				fromAddress: z.string().nullish(),
				testAddress: z.string().nullish(),
				ereaderDevices: z
					.array(
						z
							.object({
								name: z.string(),
								email: z.string(),
								availabilityOption: z.string().optional(),
								users: z.array(z.string()).optional(),
							})
							.passthrough(),
					)
					.default([]),
			})
			.passthrough(),
	})
	.passthrough()
const ok = z.object({}).passthrough()
type Settings = z.infer<typeof schema>['settings']
export function Email() {
	const admin = useAuth(
		(s) => s.user?.type === 'root' || s.user?.type === 'admin',
	)
	const [settings, setSettings] = useState<Settings>({
		host: '',
		port: 465,
		secure: true,
		rejectUnauthorized: true,
		user: '',
		pass: '',
		fromAddress: '',
		testAddress: '',
		ereaderDevices: [],
	})
	const [devices, setDevices] = useState<Settings['ereaderDevices']>([])
	const [name, setName] = useState('')
	const [email, setEmail] = useState('')
	const [availability, setAvailability] = useState('adminOrUp')
	const [deviceUsers, setDeviceUsers] = useState<string[]>([])
	const [users, setUsers] = useState<{ id: string; username: string }[]>([])
	const [editing, setEditing] = useState<string | null>(null)
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	const load = useCallback(async () => {
		if (!admin) return
		try {
			const r = await api('/api/emails/settings', schema)
			setSettings(r.settings)
			setDevices(r.settings.ereaderDevices)
		} catch (e) {
			setError(message(e))
		}
	}, [admin])
	async function loadUsers() {
		try {
			const r = await api(
				'/api/users',
				z
					.object({
						users: z.array(z.object({ id: z.string(), username: z.string() })),
					})
					.passthrough(),
			)
			setUsers(r.users.sort((a, b) => a.username.localeCompare(b.username)))
		} catch (e) {
			setError(message(e))
		}
	}
	useEffect(() => {
		void load()
	}, [load])
	function field(key: keyof Settings, label: string, type = 'text') {
		const value = settings[key]
		return (
			<label className="block">
				{label}
				<input
					className="block rounded border bg-background p-2"
					type={typeof value === 'boolean' ? 'checkbox' : type}
					value={
						typeof value === 'string' || typeof value === 'number' ? value : ''
					}
					checked={typeof value === 'boolean' ? value : undefined}
					onChange={(e) =>
						setSettings({
							...settings,
							[key]:
								typeof value === 'boolean'
									? e.target.checked
									: type === 'number'
										? Number(e.target.value)
										: e.target.value,
						})
					}
				/>
			</label>
		)
	}
	async function save() {
		if (!admin || busy) return
		setBusy(true)
		try {
			await api('/api/emails/settings', ok, {
				method: 'PATCH',
				body: JSON.stringify(
					Object.fromEntries(
						[
							'host',
							'port',
							'secure',
							'rejectUnauthorized',
							'user',
							'pass',
							'testAddress',
							'fromAddress',
						].map((k) => [k, settings[k as keyof Settings]]),
					),
				),
			})
			await load()
		} catch (e) {
			setError(message(e))
		} finally {
			setBusy(false)
		}
	}
	async function deviceWrite(next: Settings['ereaderDevices']) {
		if (!admin || busy) return
		setBusy(true)
		try {
			const r = await api(
				'/api/emails/ereader-devices',
				z.object({
					ereaderDevices: z.array(deviceSchema),
				}),
				{ method: 'POST', body: JSON.stringify({ ereaderDevices: next }) },
			)
			setDevices(r.ereaderDevices)
			setEditing(null)
		} catch (e) {
			setError(message(e))
		} finally {
			setBusy(false)
		}
	}
	function beginEdit(d: Settings['ereaderDevices'][number]) {
		setEditing(d.name)
		setName(d.name)
		setEmail(d.email)
		setAvailability(d.availabilityOption || 'adminOrUp')
		setDeviceUsers(d.users || [])
		if ((d.availabilityOption || 'adminOrUp') === 'specificUsers')
			void loadUsers()
	}
	return (
		<section className="space-y-4">
			<h1 className="text-2xl">Email</h1>
			{error && <p role="alert">{error}</p>}
			<form
				className="space-y-3"
				onSubmit={(e) => {
					e.preventDefault()
					void save()
				}}
			>
				{field('host', 'Host')}
				{field('port', 'Port', 'number')}
				{field('secure', 'Secure connection', 'checkbox')}
				{field(
					'rejectUnauthorized',
					'Reject unauthorized certificate',
					'checkbox',
				)}
				{field('user', 'Username')}
				{field('pass', 'Password', 'password')}
				<p className="text-sm text-muted-foreground">
					Password remains masked. Blank password retains server-side
					credentials when supported.
				</p>
				{field('fromAddress', 'From address')}
				{field('testAddress', 'Test address')}
				<Button
					type="button"
					variant="outline"
					disabled={!admin || busy}
					onClick={() => {
						void load()
						setError('')
					}}
				>
					Reset changes
				</Button>
				<Button disabled={!admin || busy}>Save email settings</Button>
				<Button
					type="button"
					disabled={!admin || busy || !settings.host}
					onClick={() =>
						void api('/api/emails/test', ok, { method: 'POST' }).catch((e) =>
							setError(message(e)),
						)
					}
				>
					Send test email
				</Button>
			</form>
			<h2 className="text-xl">E-reader devices</h2>
			<form
				className="space-y-3"
				onSubmit={(e) => {
					e.preventDefault()
					if (
						!name.trim() ||
						!email.trim() ||
						devices.some((d) => d.name === name.trim() && d.name !== editing) ||
						(availability === 'specificUsers' && !deviceUsers.length)
					) {
						setError(
							'Use unique device name, valid email and at least one selected user',
						)
						return
					}
					const next = devices
						.filter((d) => d.name !== editing)
						.concat([
							{
								name: name.trim(),
								email: email.trim(),
								availabilityOption: availability,
								users: availability === 'specificUsers' ? deviceUsers : [],
							},
						])
					void deviceWrite(next)
				}}
			>
				<label>
					Device name
					<input
						value={name}
						disabled={busy}
						onChange={(e) => setName(e.target.value)}
					/>
				</label>
				<label>
					Email
					<input
						type="email"
						value={email}
						disabled={busy}
						onChange={(e) => setEmail(e.target.value)}
					/>
				</label>
				<label>
					Available to
					<select
						value={availability}
						disabled={busy}
						onChange={(e) => {
							setAvailability(e.target.value)
							if (e.target.value === 'specificUsers') void loadUsers()
						}}
					>
						<option value="adminOrUp">Admins only</option>
						<option value="userOrUp">Users excluding guests</option>
						<option value="guestOrUp">Users including guests</option>
						<option value="specificUsers">Specific users</option>
					</select>
				</label>
				{availability === 'specificUsers' && (
					<fieldset>
						<legend>Accessible users</legend>
						{users.map((user) => (
							<label className="block" key={user.id}>
								<input
									type="checkbox"
									checked={deviceUsers.includes(user.id)}
									onChange={(e) =>
										setDeviceUsers(
											e.target.checked
												? [...deviceUsers, user.id]
												: deviceUsers.filter((id) => id !== user.id),
										)
									}
								/>
								{user.username}
							</label>
						))}
					</fieldset>
				)}
				<Button disabled={!admin || busy || !name.trim() || !email.trim()}>
					{editing ? 'Save device' : 'Add device'}
				</Button>
				{editing && (
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onClick={() => {
							setEditing(null)
							setName('')
							setEmail('')
						}}
					>
						Cancel edit
					</Button>
				)}
			</form>
			<ul>
				{devices.map((d) => (
					<li key={d.name} className="flex gap-3 py-2">
						{d.name} · {d.email} · {d.availabilityOption || 'adminOrUp'}
						<Button disabled={!admin || busy} onClick={() => beginEdit(d)}>
							Edit
						</Button>
						<Button
							variant="destructive"
							disabled={!admin || busy}
							onClick={() => {
								if (window.confirm(`Delete device ${d.name}?`))
									void deviceWrite(devices.filter((x) => x.name !== d.name))
							}}
						>
							Delete
						</Button>
					</li>
				))}
			</ul>
		</section>
	)
}
function message(e: unknown) {
	return e instanceof Error ? e.message : 'Request failed'
}
