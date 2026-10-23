import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { Checkbox } from '../../shared/components/ui/checkbox'
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
import { SessionDetails } from './session-details'

const admin = (type: string | undefined) => type === 'admin' || type === 'root'
const defaults = (type: string) => ({
	download: type !== 'guest',
	update: type === 'admin' || type === 'root',
	delete: type === 'admin',
	upload: type === 'admin' || type === 'root',
	createEreader: type === 'admin' || type === 'root',
	accessExplicitContent: type === 'admin' || type === 'root',
	accessAllLibraries: true,
	accessAllTags: true,
	selectedTagsNotAccessible: false,
})
const permissions = [
	'download',
	'update',
	'delete',
	'upload',
	'createEreader',
	'accessExplicitContent',
	'accessAllLibraries',
	'accessAllTags',
	'selectedTagsNotAccessible',
] as const
const userSchema = z
	.object({
		id: z.string(),
		username: z.string(),
		type: z.string(),
		email: z.string().nullish(),
		lastSeen: z.number().nullish(),
		isActive: z.boolean().optional(),
		hasOpenIDLink: z.boolean().optional(),
		permissions: z.record(z.string(), z.unknown()).optional(),
		librariesAccessible: z.array(z.string()).optional(),
		itemTagsSelected: z.array(z.string()).optional(),
		mediaProgress: z
			.array(
				z
					.object({
						id: z.string(),
						displayTitle: z.string().nullish(),
						progress: z.number().optional(),
					})
					.passthrough(),
			)
			.optional(),
	})
	.passthrough()
const usersSchema = z.object({ users: z.array(userSchema) })
const userPayload = z.object({ success: z.boolean(), user: userSchema })
const libsSchema = z.object({
	libraries: z.array(z.object({ id: z.string(), name: z.string() })),
})
const tagsSchema = z.object({ tags: z.array(z.string()) })
type User = z.infer<typeof userSchema>
function UserForm({
	initial,
	onSave,
	onClose,
}: {
	initial?: User
	onSave: (body: Record<string, unknown>) => Promise<void>
	onClose: () => void
}) {
	const current = useAuth((s) => s.user) as { type?: string } | null
	const [username, setUsername] = useState(initial?.username || ''),
		[password, setPassword] = useState(''),
		[email, setEmail] = useState(initial?.email || ''),
		[type, setType] = useState(initial?.type || 'user'),
		[active, setActive] = useState(initial?.isActive ?? true),
		[perm, setPerm] = useState<Record<string, boolean>>(() =>
			initial
				? Object.fromEntries(
						permissions.map((k) => [k, initial.permissions?.[k] === true]),
					)
				: defaults('user'),
		),
		[libs, setLibs] = useState(initial?.librariesAccessible || []),
		[tags, setTags] = useState(initial?.itemTagsSelected || []),
		[libraries, setLibraries] = useState<
			z.infer<typeof libsSchema>['libraries']
		>([]),
		[allTags, setAllTags] = useState<string[]>([]),
		[error, setError] = useState(''),
		[pending, setPending] = useState(false)
	useEffect(() => {
		void api('/libraries', libsSchema)
			.then((x) => setLibraries(x.libraries))
			.catch((e) => setError(String(e)))
		void api('/tags', tagsSchema)
			.then((x) => setAllTags(x.tags))
			.catch((e) => setError(String(e)))
	}, [])
	const root = initial?.type === 'root',
		canEditRoot = current?.type === 'root'
	return (
		<form
			className="space-y-3 border p-4"
			onSubmit={(e) => {
				e.preventDefault()
				if (pending) return
				if (root && !canEditRoot)
					return setError('Only root can edit root account.')
				if (!initial && !perm.accessAllLibraries && !libs.length)
					return setError('Choose at least one library.')
				if (!initial && !perm.accessAllTags && !tags.length)
					return setError('Choose at least one tag.')
				setPending(true)
				void onSave({
					username,
					email,
					type,
					isActive: active,
					permissions: perm,
					librariesAccessible: libs,
					itemTagsSelected: tags,
					...(password ? { password } : {}),
				})
					.catch((x) => setError(String(x)))
					.finally(() => setPending(false))
			}}
		>
			<h2>{initial ? 'Edit user' : 'Add user'}</h2>
			<Label className="block">
				Username
				<Input
					required
					value={username}
					onChange={(e) => setUsername(e.target.value)}
				/>
			</Label>
			<Label className="block">
				{initial ? 'Change password' : 'Password'}
				<Input
					type="password"
					required={!initial}
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
			</Label>
			<Label className="block">
				Email
				<Input
					type="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
			</Label>
			<Label className="block">
				Account type
				<NativeSelect
					disabled={root}
					value={type}
					onChange={(e) => {
						const t = e.target.value
						setType(t)
						setPerm(
							Object.fromEntries(
								permissions.map((k) => [
									k,
									k === 'download'
										? t !== 'guest'
										: ([
												'update',
												'delete',
												'upload',
												'createEreader',
												'accessExplicitContent',
											].includes(k) &&
												t === 'admin') ||
											k === 'accessAllLibraries' ||
											k === 'accessAllTags',
								]),
							),
						)
					}}
				>
					<option value="guest">Guest</option>
					<option value="user">User</option>
					<option value="admin">Admin</option>
				</NativeSelect>
			</Label>
			<Label>
				<Checkbox
					disabled={root}
					checked={active}
					onCheckedChange={(checked) => setActive(checked === true)}
				/>{' '}
				Enabled
			</Label>
			{!root && (
				<fieldset>
					<legend>Permissions</legend>
					{permissions.map((k) => (
						<Label className="block" key={k}>
							<Checkbox
								checked={perm[k] || false}
								onCheckedChange={(checked) =>
									setPerm({ ...perm, [k]: checked === true })
								}
							/>{' '}
							{k}
						</Label>
					))}
					{!perm.accessAllLibraries && (
						<fieldset>
							<legend>Accessible libraries</legend>
							{libraries.map((x) => (
								<Label key={x.id} className="block">
									<Checkbox
										checked={libs.includes(x.id)}
										onCheckedChange={(checked) =>
											setLibs(
												checked
													? [...libs, x.id]
													: libs.filter((i) => i !== x.id),
											)
										}
									/>
									{x.name}
								</Label>
							))}
						</fieldset>
					)}
					{!perm.accessAllTags && (
						<fieldset>
							<legend>
								{perm.selectedTagsNotAccessible
									? 'Tags excluded'
									: 'Accessible tags'}
							</legend>
							{allTags.map((x) => (
								<Label key={x} className="block">
									<Checkbox
										checked={tags.includes(x)}
										onCheckedChange={(checked) =>
											setTags(
												checked ? [...tags, x] : tags.filter((t) => t !== x),
											)
										}
									/>
									{x}
								</Label>
							))}
						</fieldset>
					)}
				</fieldset>
			)}
			{error && <p role="alert">{error}</p>}
			<Button type="submit" disabled={pending || (root && !canEditRoot)}>
				Save user
			</Button>
			<Button type="button" variant="outline" onClick={onClose}>
				Cancel
			</Button>
		</form>
	)
}
function UsersBody() {
	const current = useAuth((s) => s.user),
		[users, setUsers] = useState<User[]>([]),
		[error, setError] = useState(''),
		[editing, setEditing] = useState<User | null | false>(false)
	const load = useCallback(
		() =>
			api('/users', usersSchema)
				.then((x) => setUsers(x.users))
				.catch((e) => setError(String(e))),
		[],
	)
	useEffect(() => {
		void load()
	}, [load])
	return (
		<section className="space-y-4">
			<h1 className="text-2xl">Users</h1>
			<Button onClick={() => setEditing(null)}>Add user</Button>
			{error && <p role="alert">{error}</p>}
			{editing !== false && (
				<UserForm
					initial={editing || undefined}
					onClose={() => setEditing(false)}
					onSave={(body) =>
						api(
							editing ? `/users/${editing.id}` : '/users',
							editing ? userPayload : z.object({ user: userSchema }),
							{
								method: editing ? 'PATCH' : 'POST',
								body: JSON.stringify(body),
							},
						).then(() => {
							setEditing(false)
							return load()
						})
					}
				/>
			)}
			<ul>
				{users.map((u) => (
					<li key={u.id} className="flex gap-3">
						<Link
							to="/config/users/$id"
							params={{ id: u.id }}
							className="underline"
						>
							{u.username} — {u.type}
						</Link>
						<Button
							disabled={u.type === 'root' && current?.type !== 'root'}
							onClick={() =>
								void api(`/users/${u.id}`, userSchema)
									.then(setEditing)
									.catch((e) => setError(String(e)))
							}
						>
							Edit
						</Button>
						<Button
							variant="destructive"
							disabled={u.type === 'root' || u.id === current?.id}
							onClick={() => {
								if (
									confirm(
										`Delete user ID ${u.id} (${u.username})? This cannot be undone.`,
									)
								)
									void api(
										`/users/${u.id}`,
										z.object({ success: z.boolean() }),
										{ method: 'DELETE' },
									)
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
export function UsersPage() {
	return useAuth((s) => admin((s.user as { type?: string } | null)?.type)) ? (
		<UsersBody />
	) : (
		<p role="alert">Administrator access required.</p>
	)
}
function UserBody() {
	const id = location.pathname.split('/').filter(Boolean).at(-1) || '',
		[user, setUser] = useState<User | null>(null),
		[err, setErr] = useState(''),
		[stats, setStats] = useState<{ totalTime?: number; today?: number } | null>(
			null,
		)
	useEffect(() => {
		void api(`/users/${encodeURIComponent(id)}`, userSchema)
			.then(setUser)
			.catch((e) => setErr(String(e)))
		void api(
			`/users/${encodeURIComponent(id)}/listening-stats`,
			z.object({
				totalTime: z.number().optional(),
				today: z.number().optional(),
			}),
		)
			.then(setStats)
			.catch(() => {})
	}, [id])
	const current = useAuth((s) => s.user) as { type?: string } | null
	if (!user)
		return (
			<section>
				{err ? <p role="alert">{err}</p> : <p role="status">Loading user…</p>}
			</section>
		)
	return (
		<section className="space-y-4">
			<h1 className="text-2xl">{user.username}</h1>
			<UserForm
				key={user.id}
				initial={user}
				onClose={() => {}}
				onSave={(body) =>
					api(`/users/${id}`, userPayload, {
						method: 'PATCH',
						body: JSON.stringify(body),
					}).then((x) => setUser(x.user))
				}
			/>
			{user.hasOpenIDLink && (
				<Button
					variant="destructive"
					onClick={() => {
						if (
							confirm(
								`Unlink OpenID for user ID ${user.id} (${user.username})?`,
							)
						)
							void api(`/users/${id}/openid-unlink`, z.object({}), {
								method: 'PATCH',
							})
								.then(() => setUser({ ...user, hasOpenIDLink: false }))
								.catch((e) => setErr(String(e)))
					}}
				>
					Unlink OpenID
				</Button>
			)}
			{user.type === 'root' && current?.type === 'root' && (
				<Link to="/account" className="underline">
					Change root password
				</Link>
			)}
			<Link
				to="/config/users/$id/sessions"
				params={{ id }}
				className="underline"
			>
				Listening sessions
			</Link>
			<p>
				Total listening: {stats?.totalTime || 0}s; today: {stats?.today || 0}s
			</p>
			<h2>Saved media progress</h2>
			<ul>
				{user.mediaProgress?.map((x) => (
					<li key={x.id}>
						{x.displayTitle || 'Unknown'} —{' '}
						{Math.floor((x.progress || 0) * 100)}%
					</li>
				))}
			</ul>
			{err && <p role="alert">{err}</p>}
		</section>
	)
}
export function UserPage() {
	return useAuth((s) => admin((s.user as { type?: string } | null)?.type)) ? (
		<UserBody />
	) : (
		<p role="alert">Administrator access required.</p>
	)
}
export function UserSessionsPage() {
	return useAuth((s) => admin((s.user as { type?: string } | null)?.type)) ? (
		<Sessions user />
	) : (
		<p role="alert">Administrator access required.</p>
	)
}
const playSessionSchema = z
	.object({
		id: z.string(),
		userId: z.string().nullish(),
		libraryId: z.string().nullish(),
		libraryItemId: z.string().nullish(),
		episodeId: z.string().nullish(),
		mediaType: z.string().nullish(),
		displayTitle: z.string().nullish(),
		displayAuthor: z.string().nullish(),
		duration: z.number().nullish(),
		playMethod: z.string().nullish(),
		mediaPlayer: z.string().nullish(),
		deviceInfo: z.record(z.string(), z.unknown()).nullish(),
		startedAt: z.number().nullish(),
		updatedAt: z.number().nullish(),
		timeListening: z.number().nullish(),
		startTime: z.number().nullish(),
		currentTime: z.number().nullish(),
		user: z.object({ username: z.string().optional() }).nullish(),
	})
	.passthrough()
const sessionsSchema = z.object({
	sessions: z.array(
		z
			.object({
				id: z.string(),
				displayTitle: z.string().optional(),
				timeListening: z.number().optional(),
				currentTime: z.number().optional(),
				updatedAt: z.number().optional(),
				user: z.object({ username: z.string().optional() }).nullish(),
			})
			.passthrough(),
	),
	numPages: z.number(),
	page: z.number(),
	total: z.number().optional(),
})
function Sessions({ user = false }: { user?: boolean }) {
	const id = user ? location.pathname.split('/').filter(Boolean).at(-2) : '',
		[data, setData] = useState<z.infer<typeof sessionsSchema> | null>(null),
		[page, setPage] = useState(0),
		[sort, setSort] = useState('updatedAt'),
		[desc, setDesc] = useState(true),
		[selected, setSelected] = useState<string[]>([]),
		[error, setError] = useState(''),
		[userOptions, setUserOptions] = useState<
			Array<{ id: string; username: string }>
		>([]),
		[filter, setFilter] = useState(''),
		[open, setOpen] = useState<Array<z.infer<typeof playSessionSchema>>>([]),
		[shares, setShares] = useState<Array<z.infer<typeof playSessionSchema>>>(
			[],
		),
		[selectedSession, setSelectedSession] = useState<z.infer<
			typeof playSessionSchema
		> | null>(null)

	const load = useCallback(() => {
		const path = id
			? `/users/${encodeURIComponent(id)}/listening-sessions?page=${page}&itemsPerPage=10`
			: `/sessions?page=${page}&itemsPerPage=10&sort=${sort}&desc=${desc ? '1' : '0'}${filter ? `&user=${encodeURIComponent(filter)}` : ''}`
		void api(path, sessionsSchema)
			.then((x) => {
				setData(x)
				setSelected([])
			})
			.catch((e) => setError(String(e)))
	}, [id, page, sort, desc, filter])
	useEffect(() => {
		if (!user)
			void api(
				'/users',
				z.object({
					users: z.array(z.object({ id: z.string(), username: z.string() })),
				}),
			)
				.then((x) => setUserOptions(x.users))
				.catch((e) => setError(String(e)))
		if (!user)
			void api(
				'/sessions/open',
				z.object({
					sessions: z.array(playSessionSchema),
					shareSessions: z.array(playSessionSchema),
				}),
			)
				.then((x) => {
					setOpen(x.sessions)
					setShares(x.shareSessions)
				})
				.catch((e) => setError(String(e)))
	}, [user])
	useEffect(() => {
		load()
	}, [load])
	const remove = () => {
		if (
			selected.length &&
			confirm(
				`Delete session IDs: ${selected.join(', ')}? This cannot be undone.`,
			)
		)
			void api('/sessions/batch/delete', z.object({}), {
				method: 'POST',
				body: JSON.stringify({ sessions: selected }),
			})
				.then(load)
				.catch((e) => setError(String(e)))
	}
	return (
		<section className="space-y-3">
			<h1 className="text-2xl">Listening sessions</h1>
			{error && <p role="alert">{error}</p>}
			{!user && (
				<Label>
					User filter
					<NativeSelect
						value={filter}
						onChange={(e) => {
							setPage(0)
							setFilter(e.target.value)
						}}
					>
						<option value="">All users</option>
						{userOptions.map((u) => (
							<option key={u.id} value={u.id}>
								{u.username}
							</option>
						))}
					</NativeSelect>
				</Label>
			)}
			<Label>
				Sort
				<NativeSelect
					value={sort}
					onChange={(e) => {
						setSort(e.target.value)
						setPage(0)
					}}
				>
					<option value="updatedAt">Last update</option>
					<option value="displayTitle">Item</option>
					<option value="playMethod">Play method</option>
					<option value="timeListening">Time listened</option>
				</NativeSelect>
			</Label>
			<Button onClick={() => setDesc(!desc)}>
				{desc ? 'Descending' : 'Ascending'}
			</Button>
			<Button
				variant="destructive"
				disabled={!selected.length}
				onClick={remove}
			>
				Delete selected ({selected.length})
			</Button>
			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>
								<Checkbox
									aria-label="Select all sessions"
									checked={
										!!data?.sessions.length &&
										selected.length === data.sessions.length
									}
									onCheckedChange={(checked) =>
										setSelected(
											checked ? data?.sessions.map((s) => s.id) || [] : [],
										)
									}
								/>
							</TableHead>
							<TableHead>Item</TableHead>
							<TableHead>User</TableHead>
							<TableHead>Time listened</TableHead>
							<TableHead>Last time</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{data?.sessions.map((s) => (
							<TableRow key={s.id}>
								<TableCell>
									<Checkbox
										aria-label={`Select ${s.displayTitle || s.id}`}
										checked={selected.includes(s.id)}
										onCheckedChange={(checked) =>
											setSelected(
												checked
													? [...selected, s.id]
													: selected.filter((x) => x !== s.id),
											)
										}
									/>
								</TableCell>
								<TableCell>
									<button
										type="button"
										className="underline"
										onClick={() =>
											setSelectedSession(s as z.infer<typeof playSessionSchema>)
										}
									>
										{s.displayTitle}
									</button>
								</TableCell>
								<TableCell>{s.user?.username}</TableCell>
								<TableCell>{s.timeListening || 0}s</TableCell>
								<TableCell>{s.currentTime || 0}s</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			<Button disabled={!data || page <= 0} onClick={() => setPage(page - 1)}>
				Previous
			</Button>
			<span>
				{(data?.page || 0) + 1} / {data?.numPages || 0}
			</span>
			<Button
				disabled={!data || page >= data.numPages - 1}
				onClick={() => setPage(page + 1)}
			>
				Next
			</Button>
			{!user && open.length > 0 && (
				<>
					<h2>Open listening sessions</h2>
					<ul>
						{open.map((s) => (
							<li key={s.id}>
								<button
									type="button"
									className="underline"
									onClick={() => setSelectedSession(s)}
								>
									{s.displayTitle} — {s.user?.username}
								</button>
								<Button
									onClick={() => {
										if (confirm(`Close open session ID ${s.id}?`))
											void api(`/session/${s.id}/close`, z.object({}), {
												method: 'POST',
											})
												.then(load)
												.catch((e) => setError(String(e)))
									}}
								>
									Close
								</Button>
							</li>
						))}
					</ul>
				</>
			)}
			{!user && shares.length > 0 && (
				<>
					<h2>Open share sessions</h2>
					<ul>
						{shares.map((s) => (
							<li key={s.id}>
								<button
									type="button"
									className="underline"
									onClick={() => setSelectedSession(s)}
								>
									{s.displayTitle}
								</button>
							</li>
						))}
					</ul>
				</>
			)}
			{selectedSession && (
				<SessionDetails
					session={selectedSession}
					onClose={() => setSelectedSession(null)}
					onRefresh={load}
				/>
			)}
		</section>
	)
}
export function SessionsPage() {
	return useAuth((s) => admin((s.user as { type?: string } | null)?.type)) ? (
		<Sessions />
	) : (
		<p role="alert">Administrator access required.</p>
	)
}
