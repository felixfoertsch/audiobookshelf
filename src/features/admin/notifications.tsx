import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { Checkbox } from '../../shared/components/ui/checkbox'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { NativeSelect } from '../../shared/components/ui/native-select'
import { Textarea } from '../../shared/components/ui/textarea'
import { dateTime } from '../../shared/date-time'

const eventSchema = z
	.object({
		name: z.string(),
		description: z.string().optional(),
		descriptionKey: z.string().optional(),
		requiresLibrary: z.boolean().optional(),
		variables: z.array(z.string()).optional(),
		defaults: z
			.object({ title: z.string().optional(), body: z.string().optional() })
			.optional(),
		testData: z.record(z.string(), z.unknown()).optional(),
	})
	.passthrough()
const notification = z
	.object({
		id: z.string(),
		eventName: z.string(),
		urls: z.array(z.string()),
		titleTemplate: z.string().default(''),
		bodyTemplate: z.string().default(''),
		enabled: z.boolean(),
		libraryId: z.string().nullable().optional(),
		type: z.string().nullable().optional(),
		lastFiredAt: z.number().optional(),
		lastAttemptFailed: z.boolean().optional(),
		numConsecutiveFailedAttempts: z.number().optional(),
	})
	.passthrough()
const settingsSchema = z
	.object({
		settings: z
			.object({
				appriseApiUrl: z.string().nullable(),
				maxNotificationQueue: z.number(),
				maxFailedAttempts: z.number(),
				notifications: z.array(notification),
			})
			.passthrough(),
		data: z
			.object({
				events: z.array(eventSchema),
			})
			.passthrough(),
	})
	.passthrough()
const ok = z.object({}).passthrough()
export function Notifications() {
	const admin = useAuth(
		(s) => s.user?.type === 'root' || s.user?.type === 'admin',
	)
	const [data, setData] = useState<z.infer<typeof settingsSchema> | null>(null)
	const [url, setUrl] = useState('')
	const [queue, setQueue] = useState('')
	const [attempts, setAttempts] = useState('')
	const [selected, setSelected] = useState<z.infer<typeof notification> | null>(
		null,
	)
	const [eventName, setEvent] = useState('onTest')
	const [urls, setUrls] = useState('')
	const [title, setTitle] = useState('')
	const [body, setBody] = useState('')
	const [enabled, setEnabled] = useState(true)
	const [error, setError] = useState('')
	const [failMode, setFailMode] = useState(false)
	const [libraryId, setLibraryId] = useState('')
	const load = useCallback(async () => {
		if (!admin) return
		try {
			const d = await api('/api/notifications', settingsSchema)
			setData(d)
			setUrl(d.settings.appriseApiUrl || '')
			setQueue(String(d.settings.maxNotificationQueue))
			setAttempts(String(d.settings.maxFailedAttempts))
			setLibraryId('')
		} catch (e) {
			setError(msg(e))
		}
	}, [admin])
	useEffect(() => {
		void load()
	}, [load])
	async function update() {
		if (
			!Number.isInteger(Number(queue)) ||
			Number(queue) <= 0 ||
			!Number.isInteger(Number(attempts)) ||
			Number(attempts) <= 0
		) {
			setError('Queue size and failed attempts must be positive integers')
			return
		}
		if (url.trim()) {
			try {
				const parsed = new URL(url)
				if (!['http:', 'https:'].includes(parsed.protocol))
					throw new Error('unsupported')
			} catch {
				setError('Apprise API URL must use HTTP or HTTPS')
				return
			}
		}
		try {
			await api('/api/notifications', ok, {
				method: 'PATCH',
				body: JSON.stringify({
					appriseApiUrl: url || null,
					maxNotificationQueue: Number(queue),
					maxFailedAttempts: Number(attempts),
				}),
			})
		} catch (e) {
			setError(msg(e))
		}
	}
	async function save() {
		const parsedUrls = urls.split(/\s*,\s*/).filter(Boolean)
		if (!parsedUrls.length) {
			setError('At least one Apprise URL required')
			return
		}
		const payload = {
			...(selected ? { id: selected.id } : {}),
			eventName,
			urls: parsedUrls,
			titleTemplate: title,
			bodyTemplate: body,
			enabled,
			libraryId: libraryId.trim() || null,
			type: selected?.type || null,
		}
		try {
			await api(
				selected
					? `/api/notifications/${encodeURIComponent(selected.id)}`
					: '/api/notifications',
				ok,
				{ method: selected ? 'PATCH' : 'POST', body: JSON.stringify(payload) },
			)
			setSelected(null)
			await load()
		} catch (e) {
			setError(msg(e))
		}
	}
	return (
		<section className="space-y-4">
			<h1 className="text-2xl">Notifications</h1>
			{error && <p role="alert">{error}</p>}
			<fieldset className="space-y-2">
				<legend>Apprise settings</legend>
				<Label className="block">
					Apprise API URL
					<Input
						className="block rounded border bg-background p-2"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
					/>
				</Label>
				<Label>
					Maximum queue size
					<Input
						type="number"
						min="1"
						value={queue}
						onChange={(e) => setQueue(e.target.value)}
					/>
				</Label>
				<Label>
					Maximum failed attempts
					<Input
						type="number"
						min="1"
						value={attempts}
						onChange={(e) => setAttempts(e.target.value)}
					/>
				</Label>
				<Button type="button" disabled={!admin} onClick={() => void update()}>
					Save settings
				</Button>
			</fieldset>
			<div className="flex justify-between">
				<h2 className="text-xl">Notification events</h2>
				<Button
					disabled={!admin}
					onClick={() => {
						setSelected(null)
						setEvent('onTest')
						setUrls('')
						setTitle('')
						setBody('')
						setEnabled(true)
					}}
				>
					Create
				</Button>
			</div>
			{eventName && (
				<form
					className="space-y-2 border p-3"
					onSubmit={(e) => {
						e.preventDefault()
						void save()
					}}
				>
					<Label>
						Event
						<NativeSelect
							value={eventName}
							onChange={(e) => {
								setEvent(e.target.value)
								const ev = data?.data.events.find(
									(x) => x.name === e.target.value,
								)
								setTitle(ev?.defaults?.title || '')
								setBody(ev?.defaults?.body || '')
							}}
						>
							{data?.data.events.map((x) => (
								<option key={x.name} value={x.name}>
									{x.name}
								</option>
							))}
						</NativeSelect>
					</Label>
					<Label className="block">
						Apprise URLs (comma-separated)
						<Input
							className="block w-full rounded border bg-background p-2"
							value={urls}
							onChange={(e) => setUrls(e.target.value)}
						/>
					</Label>
					<Label className="block">
						Title template
						<Input
							className="block w-full rounded border bg-background p-2"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
						/>
					</Label>
					<Label className="block">
						Body template
						<Textarea
							className="block w-full rounded border bg-background p-2"
							rows={4}
							value={body}
							onChange={(e) => setBody(e.target.value)}
						/>
					</Label>
					{data?.data.events.find((x) => x.name === eventName)
						?.requiresLibrary && (
						<Label>
							Library ID
							<Input
								value={libraryId}
								onChange={(event) => setLibraryId(event.target.value)}
								required
							/>
						</Label>
					)}
					<p>
						Available variables:{' '}
						{data?.data.events
							.find((x) => x.name === eventName)
							?.variables?.join(', ') || 'None'}
					</p>
					<Label>
						<Checkbox
							checked={enabled}
							onCheckedChange={(checked) => setEnabled(checked === true)}
						/>{' '}
						Enabled
					</Label>
					<Button disabled={!admin}>Save notification</Button>
					<Button type="button" variant="outline" onClick={() => setEvent('')}>
						Cancel
					</Button>
				</form>
			)}
			{data?.settings.notifications.map((n) => (
				<article className="space-y-2 rounded border p-4" key={n.id}>
					<h3>{n.eventName}</h3>
					<p>{n.urls.join(', ')}</p>
					<p>
						{n.enabled ? 'Enabled' : 'Disabled'}
						{n.lastFiredAt ? ` · Last fired ${dateTime(n.lastFiredAt)}` : ''}
						{n.lastAttemptFailed ? ' · Last attempt failed' : ''}
					</p>
					<Button
						variant="outline"
						onClick={() => {
							setSelected(n)
							setEvent(n.eventName)
							setUrls(n.urls.join(', '))
							setTitle(n.titleTemplate)
							setBody(n.bodyTemplate)
							setEnabled(n.enabled)
							setLibraryId(n.libraryId || '')
						}}
					>
						Edit
					</Button>
					{n.eventName === 'onTest' ? (
						<>
							<Label>
								<Checkbox
									checked={failMode}
									onCheckedChange={(checked) => setFailMode(checked === true)}
								/>{' '}
								Intentionally fail test
							</Label>
							<Button
								disabled={!admin}
								onClick={() =>
									void api(
										`/api/notifications/test?fail=${failMode ? 1 : 0}`,
										ok,
									).catch((e) => setError(msg(e)))
								}
							>
								Fire test event
							</Button>
						</>
					) : (
						<Button
							disabled={!admin}
							onClick={() =>
								void api(
									`/api/notifications/${encodeURIComponent(n.id)}/test`,
									ok,
								).catch((e) => setError(msg(e)))
							}
						>
							Test delivery
						</Button>
					)}
					<Button
						variant="destructive"
						disabled={!admin}
						onClick={() =>
							void api(`/api/notifications/${encodeURIComponent(n.id)}`, ok, {
								method: 'DELETE',
							})
								.then(load)
								.catch((e) => setError(msg(e)))
						}
					>
						Delete
					</Button>
					<Button
						variant="outline"
						disabled={!admin}
						onClick={() =>
							void api(`/api/notifications/${encodeURIComponent(n.id)}`, ok, {
								method: 'PATCH',
								body: JSON.stringify({ id: n.id, enabled: !n.enabled }),
							})
								.then(load)
								.catch((e) => setError(msg(e)))
						}
					>
						{n.enabled ? 'Disable' : 'Enable'}
					</Button>
				</article>
			))}
		</section>
	)
}
function msg(e: unknown) {
	return e instanceof Error ? e.message : 'Request failed'
}
