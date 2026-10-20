import { useState } from 'react'
import { Button } from '../../shared/components/ui/button'
import type { Item } from './schemas'
import { updateEpisode } from './service'

type Episode = NonNullable<Item['media']['episodes']>[number]
export function EpisodeEdit({
	itemId,
	episode,
	onSaved,
	onClose,
}: {
	itemId: string
	episode: Episode
	onSaved: () => void
	onClose: () => void
}) {
	const [draft, setDraft] = useState<Record<string, string>>({
		title: episode.title || '',
		subtitle: episode.subtitle || '',
		description: episode.description || '',
		episode: String(episode.episode || ''),
		season: String(episode.season || ''),
		episodeType:
			typeof episode.episodeType === 'string' ? episode.episodeType : 'full',
		pubDate: episode.publishedAt
			? new Date(episode.publishedAt).toISOString().slice(0, 16)
			: '',
	})
	const [busy, setBusy] = useState(false),
		[error, setError] = useState('')
	return (
		<form
			aria-label="Edit episode"
			className="space-y-3 rounded border p-4"
			onSubmit={(event) => {
				event.preventDefault()
				setBusy(true)
				setError('')
				const publishedAt = draft.pubDate
					? Date.parse(`${draft.pubDate}Z`)
					: undefined
				if (publishedAt !== undefined && !Number.isFinite(publishedAt)) {
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
						onSaved()
						onClose()
					})
					.catch((error) =>
						setError(
							error instanceof Error ? error.message : 'Episode update failed',
						),
					)
					.finally(() => setBusy(false))
			}}
		>
			<h3 className="font-medium">Edit episode</h3>
			{Object.entries(draft).map(([key, value]) => (
				<label key={key} className="block">
					{key === 'pubDate' ? 'Published (UTC)' : key}
					<input
						className="block w-full rounded border bg-background p-2"
						type={key === 'pubDate' ? 'datetime-local' : 'text'}
						value={value}
						required={key === 'title'}
						maxLength={key === 'description' ? 100000 : 1000}
						onChange={(event) =>
							setDraft({ ...draft, [key]: event.target.value })
						}
					/>
				</label>
			))}
			{error && <p role="alert">{error}</p>}
			<div className="flex gap-2">
				<Button disabled={busy}>Save episode</Button>
				<Button
					type="button"
					variant="outline"
					disabled={busy}
					onClick={onClose}
				>
					Cancel
				</Button>
			</div>
		</form>
	)
}
