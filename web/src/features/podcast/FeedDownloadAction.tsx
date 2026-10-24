import { Download } from 'lucide-react'
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
	return (
		<>
			<span className="text-xs text-muted-foreground" role="status">
				{state || 'Not downloaded'}
			</span>
			{downloads.canDownload && episode.enclosure && (
				<Button
					variant="outline"
					size="icon"
					className="min-h-11 min-w-11"
					aria-label={`Download ${episode.title || 'episode'}`}
					title={state || 'Download episode'}
					disabled={!!state}
					onClick={() => void downloads.start(episode)}
				>
					<Download aria-hidden="true" className="size-4" />
				</Button>
			)}
		</>
	)
}
