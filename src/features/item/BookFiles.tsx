import { useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import type { Item } from './schemas'
import { emptySchema } from './schemas'

const ffprobeSchema = z.unknown()
const value = (v: string | number | null | undefined) =>
	v == null || v === '' ? null : String(v)
const size = (n: number | null | undefined) =>
	n == null ? null : `${(n / 1_000_000).toFixed(1)} MB`

export function BookFiles({
	item,
	onChanged,
}: {
	item: Item
	onChanged: () => void
}) {
	const user = useAuth((state) => state.user) as {
		type?: string
		permissions?: { download?: boolean; delete?: boolean }
	} | null
	const admin = user?.type === 'admin' || user?.type === 'root'
	const [busy, setBusy] = useState<string | null>(null)
	const [error, setError] = useState('')
	const [probe, setProbe] = useState<{
		ino: string | number
		data: unknown
	} | null>(null)
	const audioFiles = item.media.audioFiles ?? []
	const audioInodes = new Set(
		audioFiles.flatMap((file) => (file.ino == null ? [] : [String(file.ino)])),
	)
	const libraryFiles = (item.libraryFiles ?? []).filter(
		(file) =>
			!audioFiles.length ||
			file.ino == null ||
			!audioInodes.has(String(file.ino)),
	)
	const apiBase = window.__ABS_WEB_CONFIG__?.apiBasePath || ''
	const download = (ino: string | number) =>
		`${apiBase}/api/items/${encodeURIComponent(item.id)}/file/${encodeURIComponent(String(ino))}/download${localStorage.getItem('token') ? `?token=${encodeURIComponent(localStorage.getItem('token') || '')}` : ''}`
	const run = async (
		key: string,
		fn: () => Promise<unknown>,
		changed = false,
	) => {
		setBusy(key)
		setError('')
		try {
			const result = await fn()
			if (changed) onChanged()
			return result
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Action failed')
		} finally {
			setBusy(null)
		}
	}
	return (
		<section
			aria-label="Book files"
			className="space-y-4 border-t pt-4 [overflow-wrap:anywhere]"
		>
			{error && <p role="alert">{error}</p>}
			{audioFiles.length > 0 && (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[48rem] text-left text-sm">
						<caption className="pb-2 text-left font-medium">
							Audio tracks
						</caption>
						<thead>
							<tr>
								{[
									'Track',
									'Duration',
									'Format',
									'Codec',
									'Bit rate',
									'Channels',
									'Channel layout',
									'Language',
									'Time base',
									'Status',
									'Metadata',
									'Actions',
								].map((h) => (
									<th key={h} scope="col" className="p-2">
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{audioFiles.map((file, i) => {
								const title =
									file.metadata?.filename ||
									(file.ino == null
										? null
										: libraryFiles.find(
												(f) =>
													f.ino != null && String(f.ino) === String(file.ino),
											)?.metadata?.filename) ||
									`Track ${i + 1}`
								const metadata = Object.entries(file.metaTags ?? {})
									.map(([key, val]) => `${key}: ${String(val)}`)
									.join('; ')
								return (
									<tr
										key={file.ino == null ? `track-${i}` : String(file.ino)}
										className="border-t"
									>
										<th scope="row" className="p-2">
											{title}
										</th>
										<td className="p-2">
											{file.duration == null ? '—' : `${file.duration} s`}
										</td>
										<td className="p-2">{value(file.format) || '—'}</td>
										<td className="p-2">{value(file.codec) || '—'}</td>
										<td className="p-2">
											{file.bitRate == null ? '—' : `${file.bitRate} bit/s`}
										</td>
										<td className="p-2">{value(file.channels) || '—'}</td>
										<td className="p-2">{value(file.channelLayout) || '—'}</td>
										<td className="p-2">{value(file.language) || '—'}</td>
										<td className="p-2">{value(file.timeBase) || '—'}</td>
										<td className="p-2">
											{file.error || (file.exclude ? 'Excluded' : '—')}
										</td>
										<td className="p-2">{metadata || '—'}</td>
										<td className="p-2">
											{admin && file.ino != null && (
												<Button
													variant="outline"
													disabled={busy === `probe-${file.ino}`}
													onClick={() =>
														void run(`probe-${file.ino}`, async () => {
															const data = await api(
																`/api/items/${encodeURIComponent(item.id)}/ffprobe/${encodeURIComponent(String(file.ino))}`,
																ffprobeSchema,
																{ method: 'GET' },
															)
															setProbe({
																ino: file.ino as string | number,
																data,
															})
														})
													}
												>
													Probe {title}
												</Button>
											)}
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
			)}
			{libraryFiles.length > 0 && (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[36rem] text-left text-sm">
						<caption className="pb-2 text-left font-medium">
							Library files
						</caption>
						<thead>
							<tr>
								{['Filename', 'Path', 'Size', 'Type', 'Actions'].map((h) => (
									<th key={h} scope="col" className="p-2">
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{libraryFiles.map((file, i) => {
								const name = file.metadata?.filename || `File ${i + 1}`
								return (
									<tr
										key={file.ino == null ? `file-${i}` : String(file.ino)}
										className="border-t"
									>
										<th scope="row" className="p-2">
											{name}
										</th>
										<td className="p-2">{value(file.metadata?.path) || '—'}</td>
										<td className="p-2">{size(file.metadata?.size) || '—'}</td>
										<td className="p-2">
											{value(file.metadata?.ext || file.fileType) || '—'}
										</td>
										<td className="flex items-center gap-2 p-2">
											{file.ino != null &&
												user?.permissions?.download === true && (
													<a
														className="underline"
														href={download(file.ino)}
														download
														aria-label={`Download ${name}`}
													>
														Download
													</a>
												)}
											{file.ino != null &&
												user?.permissions?.delete === true && (
													<Button
														variant="destructive"
														disabled={busy === `delete-${file.ino}`}
														onClick={() => {
															if (
																window.confirm(
																	`Permanently delete original file “${name}”? This cannot be undone.`,
																)
															)
																void run(
																	`delete-${file.ino}`,
																	() =>
																		api(
																			`/api/items/${encodeURIComponent(item.id)}/file/${encodeURIComponent(String(file.ino))}`,
																			emptySchema,
																			{ method: 'DELETE' },
																		),
																	true,
																)
														}}
													>
														Delete {name}
													</Button>
												)}
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
			)}
			{probe && (
				<details open>
					<summary>ffprobe result for file {probe.ino}</summary>
					<pre className="max-h-96 overflow-auto whitespace-pre-wrap">
						{JSON.stringify(probe.data, null, 2)}
					</pre>
					<Button variant="outline" onClick={() => setProbe(null)}>
						Close ffprobe result
					</Button>
				</details>
			)}
		</section>
	)
}
