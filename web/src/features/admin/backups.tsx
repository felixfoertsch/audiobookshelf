import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { api, apiBinary, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { dateTime } from '../../shared/date-time'

const backup = z
	.object({
		id: z.string(),
		path: z.string(),
		createdAt: z.number(),
		fileSize: z.number(),
		serverVersion: z.string().nullish(),
		key: z.string().nullish(),
	})
	.passthrough()
const backupsSchema = z
	.object({
		backups: z.array(backup),
		backupLocation: z.string(),
		backupPathEnvSet: z.boolean(),
	})
	.passthrough()
const authSchema = z
	.object({
		user: z.object({ type: z.string() }),
		serverSettings: z.object({
			backupSchedule: z.union([z.string(), z.boolean()]),
			backupsToKeep: z.number(),
			maxBackupSize: z.number(),
		}),
		backupPathEnvSet: z.boolean().optional(),
	})
	.passthrough()
const ok = z.object({}).passthrough()
export function Backups() {
	const userType = useAuth((s) => s.user?.type)
	const admin = userType === 'root' || userType === 'admin'
	const [data, setData] = useState<z.infer<typeof backupsSchema> | null>(null)
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	const [path, setPath] = useState('')
	const [confirmation, setConfirmation] = useState<Record<string, string>>({})
	const [keep, setKeep] = useState('')
	const [size, setSize] = useState('')
	const [enabled, setEnabled] = useState(false)
	const [cron, setCron] = useState('')
	const load = useCallback(async () => {
		if (!admin) return
		try {
			const auth = await api('/authorize', authSchema, { method: 'POST' })
			setKeep(String(auth.serverSettings.backupsToKeep))
			setSize(String(auth.serverSettings.maxBackupSize))
			setEnabled(Boolean(auth.serverSettings.backupSchedule))
			setCron(
				typeof auth.serverSettings.backupSchedule === 'string'
					? auth.serverSettings.backupSchedule
					: '',
			)
			const result = await api('/api/backups', backupsSchema)
			setData(result)
			setPath(result.backupLocation)
		} catch (e) {
			setError(msg(e))
		}
	}, [admin])
	useEffect(() => {
		void load()
	}, [load])
	async function run(action: () => Promise<unknown>) {
		if (!admin || busy) return
		setBusy(true)
		setError('')
		try {
			await action()
			await load()
		} catch (e) {
			setError(msg(e))
		} finally {
			setBusy(false)
		}
	}
	if (!admin)
		return (
			<section>
				<h1 className="text-2xl">Backups</h1>
				<p role="alert">Administrator permission required.</p>
			</section>
		)
	return (
		<section className="space-y-4">
			<h1 className="text-2xl">Backups</h1>
			{error && <p role="alert">{error}</p>}
			{!data ? (
				<p role="status">Loading backup settings…</p>
			) : (
				<>
					<label className="block">
						Backup location
						<input
							className="block w-full rounded border bg-background p-2"
							value={path}
							disabled={busy || data.backupPathEnvSet}
							onChange={(e) => setPath(e.target.value)}
						/>
					</label>
					<Button
						disabled={busy || !path.trim() || data.backupPathEnvSet}
						onClick={() =>
							void run(() =>
								api('/api/backups/path', ok, {
									method: 'PATCH',
									body: JSON.stringify({ path: path.trim() }),
								}),
							)
						}
					>
						Save location
					</Button>
					<fieldset className="space-y-2">
						<legend>Automatic backups</legend>
						<label>
							<input
								type="checkbox"
								checked={enabled}
								disabled={busy}
								onChange={(e) => setEnabled(e.target.checked)}
							/>{' '}
							Enable schedule
						</label>
						<label className="block">
							Cron schedule
							<input
								className="block rounded border bg-background p-2"
								value={cron}
								disabled={busy}
								onChange={(e) => setCron(e.target.value)}
							/>
						</label>
						<label className="block">
							Backups to keep
							<input
								type="number"
								min="1"
								max="99"
								value={keep}
								disabled={busy}
								onChange={(e) => setKeep(e.target.value)}
							/>
						</label>
						<label className="block">
							Maximum backup size (GB)
							<input
								type="number"
								min="0"
								value={size}
								disabled={busy}
								onChange={(e) => setSize(e.target.value)}
							/>
						</label>
						<Button
							disabled={
								busy ||
								!Number.isInteger(Number(keep)) ||
								Number(keep) < 1 ||
								Number(keep) > 99 ||
								!Number.isFinite(Number(size)) ||
								Number(size) < 0
							}
							onClick={() =>
								void run(() =>
									api('/settings', ok, {
										method: 'PATCH',
										body: JSON.stringify({
											backupSchedule: enabled ? cron : false,
											backupsToKeep: Number(keep),
											maxBackupSize: Number(size),
										}),
									}),
								)
							}
						>
							Save schedule
						</Button>
					</fieldset>
					<div className="flex gap-2">
						<Button
							disabled={busy}
							onClick={() =>
								void run(() => api('/api/backups', ok, { method: 'POST' }))
							}
						>
							Create backup
						</Button>
						<label className="cursor-pointer">
							Upload backup
							<input
								aria-label="Upload backup"
								className="sr-only"
								type="file"
								accept=".audiobookshelf"
								disabled={busy}
								onChange={(e) => {
									const file = e.target.files?.[0]
									if (!file) return
									const form = new FormData()
									form.set('file', file)
									void run(() =>
										api(
											'/api/backups/upload',
											z.object({ backups: z.array(backup) }),
											{
												method: 'POST',
												body: form,
											},
										),
									)
								}}
							/>
						</label>
					</div>
					<ul className="divide-y">
						{data.backups.map((b) => (
							<li className="space-y-2 py-3" key={b.id}>
								<p>
									{b.path} · {dateTime(b.createdAt)} · {b.fileSize} bytes{' '}
									{!b.serverVersion && '· unsupported legacy backup'}
								</p>
								<div className="flex flex-wrap gap-2">
									<Button
										variant="outline"
										disabled={busy}
										onClick={async () => {
											if (
												!admin ||
												busy ||
												!data?.backups.some(
													(current) =>
														current.id === b.id && current.path === b.path,
												)
											)
												return
											setBusy(true)
											setError('')
											try {
												const bytes = await apiBinary(
													`/api/backups/${encodeURIComponent(b.id)}/download`,
												)
												const blob = new Blob([bytes])
												if (!blob.size)
													throw new Error('Backup download returned empty file')
												const url = URL.createObjectURL(blob)
												const a = document.createElement('a')
												a.href = url
												a.download =
													b.path.split('/').pop() || 'backup.audiobookshelf'
												a.click()
												URL.revokeObjectURL(url)
											} catch (e) {
												setError(msg(e))
											} finally {
												setBusy(false)
											}
										}}
									>
										Download
									</Button>
									<Button
										variant="destructive"
										disabled={busy}
										onClick={() => {
											if (window.confirm(`Delete backup ${b.path}?`))
												void run(() =>
													api(
														`/api/backups/${encodeURIComponent(b.id)}`,
														z.object({ backups: z.array(backup) }),
														{ method: 'DELETE' },
													),
												)
										}}
									>
										Delete
									</Button>
									{b.serverVersion && b.key && (
										<>
											<label>
												Type full backup path to confirm restore
												<input
													aria-label={`Confirm restore ${b.id}`}
													disabled={busy}
													value={confirmation[b.id] || ''}
													onChange={(e) =>
														setConfirmation({
															...confirmation,
															[b.id]: e.target.value,
														})
													}
												/>
											</label>
											<Button
												variant="destructive"
												disabled={
													busy ||
													confirmation[b.id] !== b.path ||
													!data.backups.some(
														(x) =>
															x.id === b.id &&
															x.path === b.path &&
															x.key === b.key &&
															x.serverVersion === b.serverVersion,
													)
												}
												onClick={() => {
													if (
														busy ||
														!admin ||
														confirmation[b.id] !== b.path ||
														!b.key ||
														!b.serverVersion ||
														!data.backups.some(
															(current) =>
																current.id === b.id &&
																current.path === b.path &&
																current.key === b.key &&
																current.serverVersion === b.serverVersion,
														)
													)
														return
													void run(async () => {
														const fresh = await api(
															'/api/backups',
															backupsSchema,
														)
														const current = fresh.backups.find(
															(x) => x.id === b.id,
														)
														setData(fresh)
														if (
															!current ||
															[
																'id',
																'path',
																'key',
																'serverVersion',
																'createdAt',
																'fileSize',
															].some((field) => current[field] !== b[field])
														) {
															setConfirmation((values) => ({
																...values,
																[b.id]: '',
															}))
															throw new Error(
																'Backup changed. Review it and confirm again.',
															)
														}
														if (
															window.confirm(
																`Restore backup ${b.path}? This replaces current server data.`,
															)
														)
															await api(
																`/api/backups/${encodeURIComponent(b.id)}/apply`,
																ok,
																{ method: 'GET' },
															)
													})
												}}
											>
												Restore
											</Button>
										</>
									)}
								</div>
							</li>
						))}
					</ul>
					{!data.backups.length && <p>No backups.</p>}
				</>
			)}
		</section>
	)
}
function msg(e: unknown) {
	return e instanceof Error ? e.message : 'Request failed'
}
