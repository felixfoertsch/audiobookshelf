import { useId, useState } from 'react'
import { Button } from '../../shared/components/ui/button'
import { Input } from '../../shared/components/ui/input'
import type { Item } from './schemas'
import { updateEpisode } from './service'
import { WorkflowSheet } from './WorkflowSheet'

type Episode = NonNullable<Item['media']['episodes']>[number]
export function EpisodeEdit({
	itemId,
	episode,
	onSaved,
	drafts,
}: {
	itemId: string
	episode: Episode
	drafts?: Map<string, Record<string, string>>
	onSaved: () => void
}) {
	const [open, setOpen] = useState(false)
	const fieldId = useId()
	const canonicalDraft = () => ({
		title: episode.title || '',
		subtitle: episode.subtitle || '',
		description: episode.description || '',
		episode: String(episode.episode || ''),
		season: String(episode.season || ''),
		episodeType:
			typeof episode.episodeType === 'string' ? episode.episodeType : 'full',
		pubDate: episode.publishedAt
			? new Date(episode.publishedAt)
					.toISOString()
					.slice(0, 16)
					.replace('T', ' ')
			: '',
	})
	const [draft, setDraft] = useState<Record<string, string>>(canonicalDraft)
	const [dirty, setDirty] = useState(false)
	const [busy, setBusy] = useState(false),
		[error, setError] = useState('')
	return (
		<WorkflowSheet
			title="Edit episode"
			description={episode.title || 'Untitled episode'}
			open={open}
			onOpenChange={(nextOpen) => {
				if (nextOpen && !dirty)
					setDraft(drafts?.get(episode.id) ?? canonicalDraft())
				setOpen(nextOpen)
			}}
		>
			<form
				aria-label="Edit episode"
				className="space-y-3 rounded border p-4"
				onSubmit={(event) => {
					event.preventDefault()
					setBusy(true)
					setError('')
					const publishedAt = draft.pubDate
						? Date.parse(`${draft.pubDate.replace(' ', 'T')}Z`)
						: undefined
					if (
						publishedAt !== undefined &&
						(!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(draft.pubDate) ||
							!Number.isFinite(publishedAt) ||
							new Date(publishedAt).toISOString().slice(0, 16) !==
								draft.pubDate.replace(' ', 'T'))
					) {
						setError('Invalid publication date')
						setBusy(false)
						return
					}
					void updateEpisode(itemId, episode.id, {
						...draft,
						...(publishedAt !== undefined
							? { publishedAt, pubDate: new Date(publishedAt).toUTCString() }
							: {}),
					})
						.then(() => {
							drafts?.delete(episode.id)
							setDirty(false)
							onSaved()
							setOpen(false)
						})
						.catch((error) =>
							setError(
								error instanceof Error
									? error.message
									: 'Episode update failed',
							),
						)
						.finally(() => setBusy(false))
				}}
			>
				<h3 className="font-medium">Edit episode</h3>
				{Object.entries(draft).map(([key, value]) => {
					const Control = key === 'description' ? 'textarea' : Input
					return (
						<label
							htmlFor={`${fieldId}-${key}`}
							key={key}
							className="grid gap-1"
						>
							{{
								title: 'Title',
								subtitle: 'Subtitle',
								description: 'Description',
								episode: 'Episode number',
								season: 'Season',
								episodeType: 'Episode type',
								pubDate: 'Published (UTC, YYYY-MM-DD HH:MM)',
							}[key] ?? key}
							<Control
								id={`${fieldId}-${key}`}
								className={
									key === 'description'
										? 'min-h-32 w-full rounded-md border bg-background p-3 text-sm'
										: ''
								}
								value={value}
								required={key === 'title'}
								maxLength={key === 'description' ? 100000 : 1000}
								onChange={(event) => {
									const next = { ...draft, [key]: event.target.value }
									drafts?.set(episode.id, next)
									setDirty(true)
									setDraft(next)
								}}
							/>
						</label>
					)
				})}
				{error && <p role="alert">{error}</p>}
				<div className="flex gap-2">
					<Button disabled={busy}>Save episode</Button>
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onClick={() => setOpen(false)}
					>
						Cancel
					</Button>
				</div>
			</form>
		</WorkflowSheet>
	)
}
