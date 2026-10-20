import { createFileRoute } from '@tanstack/react-router'
import { MetadataList } from '../features/admin/metadata'
export const Route = createFileRoute('/config/item-metadata-utils/genres')({
	component: () => <MetadataList kind="genres" />,
})
