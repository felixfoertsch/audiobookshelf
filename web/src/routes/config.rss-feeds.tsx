import { createFileRoute } from '@tanstack/react-router'
import { RssFeeds } from '../features/admin/rss-feeds'
export const Route = createFileRoute('/config/rss-feeds')({
	component: RssFeeds,
})
