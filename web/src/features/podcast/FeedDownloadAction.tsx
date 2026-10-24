import { Download, LoaderCircle } from 'lucide-react'
import { Button } from '../../shared/components/ui/button'
import type { FeedEpisode, useEpisodeDownloads } from './feed-episodes'

export function FeedDownloadAction({
	episode,
	downloads,
}: {
	episode: FeedEpisode
	downloads: ReturnType<typeof useEpisodeDownloads>
}) {
	const state = downloads.state(episode)
	if (state)
		return (
			<span
				className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
				role="status"
				aria-live="polite"
			>
				<LoaderCircle
					aria-hidden="true"
					className="size-4 motion-safe:animate-spin"
				/>
				{state}
			</span>
		)
	return (
		<>
			{downloads.canDownload && episode.enclosure && (
				<Button
					variant="default"
					className="min-h-11 min-w-11 rounded-full"
					aria-label={`Download ${episode.title || 'episode'}`}
					title="Download episode"
					onClick={() => void downloads.start(episode)}
				>
					<Download aria-hidden="true" className="size-4" />
					Download
				</Button>
			)}
			<span
				className="text-xs text-muted-foreground"
				role="status"
				aria-live="polite"
			>
				Not downloaded
			</span>
		</>
	)
}
