import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { Input } from '../../shared/components/ui/input'
import {
	NativeSelect,
	NativeSelectOption,
} from '../../shared/components/ui/native-select'
import { dateTime } from '../../shared/date-time'

const keySchema = z
	.object({
		id: z.string(),
		name: z.string(),
		isActive: z.boolean(),
		expiresAt: z.string().nullish(),
		userId: z.string(),
		user: z
			.object({ username: z.string(), type: z.string() })
			.passthrough()
			.optional(),
	})
	.passthrough()
const keysSchema = z.object({ apiKeys: z.array(keySchema) }),
	usersSchema = z.object({
		users: z.array(
			z.object({ id: z.string(), username: z.string(), type: z.string() }),
		),
	})
type Key = z.infer<typeof keySchema>
const isAdmin = (type: string | undefined) =>
	type === 'admin' || type === 'root'
export function ApiKeysPage() {
	const allowed = useAuth((s) =>
			isAdmin((s.user as { type?: string } | null)?.type),
		),
		auth = useAuth((s) => s.user) as { type?: string } | null,
		[keys, setKeys] = useState<Key[]>([]),
		[users, setUsers] = useState<z.infer<typeof usersSchema>['users']>([]),
		[error, setError] = useState(''),
		[secret, setSecret] = useState(''),
		[editing, setEditing] = useState<Key | null | false>(false)
	const load = useCallback(
		() =>
			api('/api-keys', keysSchema)
				.then((x) => setKeys(x.apiKeys))
				.catch((e) => setError(String(e))),
		[],
	)
	useEffect(() => {
		if (!allowed) return
		void load()
		void api('/users', usersSchema)
			.then((x) => setUsers(x.users))
			.catch((e) => setError(String(e)))
	}, [allowed, load])
	if (!allowed || !auth)
		return <p role="alert">Administrator access required.</p>
	return (
		<section className="space-y-4">
			<h1 className="text-2xl">API keys</h1>
			{error && <p role="alert">{error}</p>}
			{secret && (
				<div className="border p-3">
					<p>Copy this API key now. It will not be shown again.</p>
					<label htmlFor="new-api-key">
						API key
						<Input
							id="new-api-key"
							aria-label="New API key"
							readOnly
							value={secret}
						/>
					</label>
					<Button
						onClick={() =>
							void navigator.clipboard
								?.writeText(secret)
								.catch(() => setError('Clipboard access denied'))
						}
					>
						Copy API key
					</Button>
					<Button onClick={() => setSecret('')}>Dismiss</Button>
				</div>
			)}
			<Button disabled={!!secret} onClick={() => setEditing(null)}>
				Create API key
			</Button>
			{editing !== false && (
				<KeyForm
					key={editing?.id || 'new'}
					initial={editing || undefined}
					users={users.filter((u) => auth.type === 'root' || u.type !== 'root')}
					onCancel={() => setEditing(false)}
					disabled={
						!!editing &&
						!!editing.expiresAt &&
						Date.parse(editing.expiresAt) < Date.now() &&
						!editing.isActive
					}
					onSave={async (body) => {
						if (editing) {
							await api(
								`/api-keys/${editing.id}`,
								z.object({ apiKey: keySchema }),
								{ method: 'PATCH', body: JSON.stringify(body) },
							)
							setEditing(false)
							await load()
						} else {
							const result = await api(
								'/api-keys',
								z.object({
									apiKey: z.object({ apiKey: z.string() }).passthrough(),
								}),
								{ method: 'POST', body: JSON.stringify(body) },
							)
							setSecret(result.apiKey.apiKey)
							setEditing(false)
							await load()
						}
					}}
				/>
			)}
			<ul>
				{keys.map((k) => (
					<li key={k.id} className="flex gap-2">
						{k.name} — {k.user?.username || 'Unknown user'} —{' '}
						{k.expiresAt ? dateTime(k.expiresAt) : 'Never'}{' '}
						<Button
							disabled={
								!!k.expiresAt &&
								Date.parse(k.expiresAt) < Date.now() &&
								!k.isActive
							}
							onClick={() => setEditing(k)}
						>
							Edit
						</Button>
						<Button
							variant="destructive"
							onClick={() => {
								if (
									confirm(
										`Delete API key ID ${k.id} (${k.name})? This cannot be undone.`,
									)
								)
									void api(`/api-keys/${k.id}`, z.object({}), {
										method: 'DELETE',
									})
										.then(load)
										.catch((e) => setError(String(e)))
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
function KeyForm({
	initial,
	users,
	onSave,
	onCancel,
	disabled,
}: {
	initial?: Key
	users: Array<{ id: string; username: string; type: string }>
	onSave: (body: Record<string, unknown>) => Promise<void>
	onCancel: () => void
	disabled?: boolean
}) {
	const pending = useRef(false)
	const [saving, setSaving] = useState(false)
	const [name, setName] = useState(initial?.name || ''),
		[userId, setUserId] = useState(initial?.userId || ''),
		[active, setActive] = useState(initial?.isActive ?? true),
		[expires, setExpires] = useState(''),
		[error, setError] = useState('')
	return (
		<form
			className="space-y-2 border p-4"
			onSubmit={(e) => {
				e.preventDefault()
				if (pending.current || disabled) return
				pending.current = true
				setSaving(true)
				const body = initial
					? { userId, isActive: active }
					: {
							name,
							userId,
							isActive: active,
							...(expires ? { expiresIn: Number(expires) } : {}),
						}
				void onSave(body)
					.catch((x) => setError(String(x)))
					.finally(() => {
						pending.current = false
						setSaving(false)
					})
			}}
		>
			<fieldset className="min-w-0 space-y-3" disabled={saving || disabled}>
				<label className="block" htmlFor="api-key-name">
					Name
					<Input
						id="api-key-name"
						required
						readOnly={!!initial}
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</label>
				{!initial && (
					<label className="block" htmlFor="api-key-expires">
						Expires in seconds (blank means never)
						<Input
							id="api-key-expires"
							type="number"
							min="1"
							value={expires}
							onChange={(e) => setExpires(e.target.value)}
						/>
					</label>
				)}
				<label className="block" htmlFor="api-key-user">
					User
				</label>
				<NativeSelect
					id="api-key-user"
					required
					value={userId}
					disabled={disabled}
					onChange={(e) => setUserId(e.target.value)}
				>
					<NativeSelectOption value="">Select user</NativeSelectOption>
					{users.map((u) => (
						<NativeSelectOption key={u.id} value={u.id}>
							{u.username} ({u.type})
						</NativeSelectOption>
					))}
				</NativeSelect>
				<label>
					<input
						type="checkbox"
						checked={active}
						disabled={disabled}
						onChange={(e) => setActive(e.target.checked)}
					/>{' '}
					Active
				</label>
				{initial?.expiresAt && Date.parse(initial.expiresAt) < Date.now() && (
					<p>Expired</p>
				)}
				{error && <p role="alert">{error}</p>}
				<Button disabled={disabled}>Save API key</Button>
				<Button type="button" variant="outline" onClick={onCancel}>
					Cancel
				</Button>
			</fieldset>
		</form>
	)
}
