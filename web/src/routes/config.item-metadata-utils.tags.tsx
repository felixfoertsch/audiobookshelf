import { createFileRoute } from '@tanstack/react-router'
import { MetadataList } from '../features/admin/metadata'
export const Route = createFileRoute('/config/item-metadata-utils/tags')({
	component: () => <MetadataList kind="tags" />,
})
