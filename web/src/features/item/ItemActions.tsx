import { useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import {
	feedAddress as feedTransportAddress,
	itemActions,
	sharePayload,
} from './item-actions'
import type { Item } from './schemas'

const devicesSchema = z
	.object({
		ereaderDevices: z.array(z.object({ name: z.string() }).passthrough()),
	})
	.passthrough()

export function ItemActions({
	item,
	onChanged,
}: {
	item: Item
	onChanged: () => void
}) {
	const user = useAuth((state) => state.user) as
		| (typeof useAuth extends never
				? never
				: {
						id: string
						type?: string
						permissions?: {
							download?: boolean
							delete?: boolean
							update?: boolean
						}
					})
		| null
	const admin = user?.type === 'admin' || user?.type === 'root'
	const canDownload = user?.permissions?.download === true
	const canDelete = user?.permissions?.delete === true
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	const [slug, setSlug] = useState('')
	const [shareUrl, setShareUrl] = useState('')
	const [shareDownload, setShareDownload] = useState(false)
	const [shareExpiry, setShareExpiry] = useState('0')
	const [hard, setHard] = useState(false)
	const [device, setDevice] = useState('')
	const [devices, setDevices] = useState<string[]>([])
	const [feedSlug, setFeedSlug] = useState('')
	const [feedAddress, setFeedAddress] = useState(
		`${window.location.origin}${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}`,
	)
	const existingShare = (
		item as Item & { mediaItemShare?: { id?: string; slug?: string } }
	).mediaItemShare
	const feed = (
		item as Item & {
			rssFeed?: { id?: string; feedUrl?: string; slug?: string }
		}
	).rssFeed
	const run = async (fn: () => Promise<unknown>) => {
		setBusy(true)
		setError('')
		try {
			await fn()
			onChanged()
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Action failed')
		} finally {
			setBusy(false)
		}
	}
	async function loadDevices() {
		try {
			const result = await api('/api/authorize', devicesSchema, {
				method: 'POST',
			})
			const visible = result.ereaderDevices.map((d) => d.name)
			setDevices(visible)
			if (visible[0]) setDevice(visible[0])
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not load devices')
		}
	}
	return (
		<section aria-label="Item actions" className="space-y-4 border-t pt-4">
			<h2 className="text-xl font-semibold">Item actions</h2>
			{error && <p role="alert">{error}</p>}
			{admin && (
				<section className="space-y-2">
					<h3 className="font-medium">Share</h3>
					{existingShare?.id ? (
						<>
							<p>Shared: {existingShare.slug}</p>
							<a
								className="underline"
								href={`${window.location.origin}${window.__ABS_WEB_CONFIG__?.basePath || ''}/share/${encodeURIComponent(existingShare.slug || '')}`}
							>
								Open share
							</a>
							<Button
								disabled={busy}
								variant="destructive"
								onClick={() => {
									if (
										window.confirm(
											'Revoke public share? Existing share links stop working.',
										)
									)
										void run(() =>
											itemActions.revokeShare(existingShare.id || ''),
										)
								}}
							>
								Revoke share
							</Button>
						</>
					) : (
						<form
							className="flex flex-wrap items-end gap-2"
							onSubmit={(e) => {
								e.preventDefault()
								void run(async () => {
									const result = await itemActions.createShare(
										sharePayload(
											item,
											slug.trim(),
											Number(shareExpiry),
											shareDownload,
										),
									)
									const url = `${window.location.origin}${window.__ABS_WEB_CONFIG__?.basePath || ''}/share/${encodeURIComponent(result.slug)}`
									setShareUrl(url)
									try {
										await navigator.clipboard.writeText(url)
									} catch {
										setError(
											'Share created. Copy share URL using the link below.',
										)
									}
								})
							}}
						>
							<label>
								Slug
								<input
									required
									pattern="[A-Za-z0-9_-]+"
									value={slug}
									onChange={(e) => setSlug(e.target.value)}
									className="ml-2 rounded border bg-background p-2"
								/>
							</label>
							<label>
								Expiry timestamp
								<input
									type="number"
									min="0"
									value={shareExpiry}
									onChange={(e) => setShareExpiry(e.target.value)}
									className="ml-2 rounded border bg-background p-2"
								/>
							</label>
							<label>
								<input
									type="checkbox"
									checked={shareDownload}
									onChange={(e) => setShareDownload(e.target.checked)}
								/>{' '}
								Allow download
							</label>
							<Button
								disabled={
									busy ||
									!Number.isFinite(Number(shareExpiry)) ||
									Number(shareExpiry) < 0 ||
									!/^[A-Za-z0-9_-]+$/.test(slug.trim()) ||
									item.mediaType !== 'book' ||
									!item.media.id
								}
							>
								Create and copy share
							</Button>
						</form>
					)}
					{shareUrl && (
						<p>
							Share URL:{' '}
							<a className="underline" href={shareUrl}>
								{shareUrl}
							</a>
						</p>
					)}
				</section>
			)}
			{admin && (
				<section className="space-y-2">
					<h3 className="font-medium">RSS feed</h3>
					{feed?.id ? (
						<>
							<p>{feed.feedUrl || feed.slug}</p>
							<Button
								disabled={busy}
								variant="outline"
								onClick={() =>
									void navigator.clipboard.writeText(
										feedTransportAddress(feed.feedUrl || `/feed/${feed.slug}`),
									)
								}
							>
								Copy feed URL
							</Button>
							<Button
								disabled={busy}
								variant="destructive"
								onClick={() => {
									if (
										window.confirm(
											'Close RSS feed? Existing subscribers lose access.',
										)
									)
										void run(() => itemActions.closeFeed(feed.id || ''))
								}}
							>
								Close feed
							</Button>
						</>
					) : (
						<form
							className="flex flex-wrap items-end gap-2"
							onSubmit={(e) => {
								e.preventDefault()
								void run(() =>
									itemActions.openFeed(item.id, {
										slug: feedSlug.trim(),
										serverAddress: feedAddress.trim(),
										preventIndexing: true,
									}),
								)
							}}
						>
							<label>
								RSS slug
								<input
									required
									pattern="[A-Za-z0-9_-]+"
									value={feedSlug}
									onChange={(e) => setFeedSlug(e.target.value)}
									className="ml-2 rounded border bg-background p-2"
								/>
							</label>
							<label>
								Server address
								<input
									required
									type="url"
									value={feedAddress}
									onChange={(e) => setFeedAddress(e.target.value)}
									className="ml-2 rounded border bg-background p-2"
								/>
							</label>
							<Button disabled={busy}>Open RSS feed</Button>
						</form>
					)}
				</section>
			)}
			{item.mediaType === 'book' && item.media.ebookFile && (
				<section className="space-y-2">
					<h3 className="font-medium">Send ebook to device</h3>
					{!devices.length ? (
						<Button variant="outline" onClick={() => void loadDevices()}>
							Load available devices
						</Button>
					) : (
						<>
							<select
								aria-label="E-reader device"
								value={device}
								onChange={(e) => setDevice(e.target.value)}
							>
								{devices.map((name) => (
									<option key={name}>{name}</option>
								))}
							</select>
							<Button
								disabled={busy || !device}
								onClick={() =>
									void run(() => itemActions.sendEbook(item.id, device))
								}
							>
								Send ebook
							</Button>
						</>
					)}
				</section>
			)}
			{item.libraryFiles?.some(
				(file) => file.fileType === 'ebook' || file.ebookFormat,
			) && (
				<section className="space-y-2">
					<h3 className="font-medium">Ebook files</h3>
					<ul>
						{item.libraryFiles
							.filter((file) => file.fileType === 'ebook' || file.ebookFormat)
							.map((file) => (
								<li
									key={String(file.ino)}
									className="flex flex-wrap items-center gap-2"
								>
									{file.metadata?.filename || `Ebook ${file.ino}`} ·{' '}
									{String(
										(file as typeof file & { isSupplementary?: boolean })
											.isSupplementary
											? 'Supplementary'
											: 'Primary',
									)}{' '}
									{canDownload && (
										<a
											className="underline"
											href={`${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}/api/items/${encodeURIComponent(item.id)}/file/${encodeURIComponent(String(file.ino))}/download${localStorage.getItem('token') ? `?token=${encodeURIComponent(localStorage.getItem('token') || '')}` : ''}`}
											download
										>
											Download
										</a>
									)}{' '}
									{user?.permissions?.update && (
										<Button
											variant="outline"
											disabled={busy || file.ino == null}
											onClick={() =>
												void run(() =>
													itemActions.setEbookStatus(
														item.id,
														file.ino as string | number,
													),
												)
											}
										>
											Set as{' '}
											{(file as typeof file & { isSupplementary?: boolean })
												.isSupplementary
												? 'primary'
												: 'supplementary'}
										</Button>
									)}
								</li>
							))}
					</ul>
				</section>
			)}
			{canDownload && (
				<a
					className="underline"
					href={`${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}/api/items/${encodeURIComponent(item.id)}/download${localStorage.getItem('token') ? `?token=${encodeURIComponent(localStorage.getItem('token') || '')}` : ''}`}
					download
				>
					Download item
				</a>
			)}
			{canDelete && (
				<section className="flex flex-wrap items-center gap-2">
					<label>
						<input
							type="checkbox"
							checked={hard}
							onChange={(e) => setHard(e.target.checked)}
						/>{' '}
						Delete media from filesystem
					</label>
					<Button
						variant="destructive"
						disabled={busy}
						onClick={() => {
							if (
								window.confirm(
									hard
										? 'Permanently delete item and media files from filesystem? This cannot be undone.'
										: 'Remove item from library? Media files remain unchanged.',
								)
							)
								void run(async () => {
									await itemActions.deleteItem(item.id, hard)
									window.location.assign(
										`${window.__ABS_WEB_CONFIG__?.basePath || '/new'}/`,
									)
								})
						}}
					>
						{hard ? 'Delete item and files' : 'Remove from library'}
					</Button>
				</section>
			)}
		</section>
	)
}
