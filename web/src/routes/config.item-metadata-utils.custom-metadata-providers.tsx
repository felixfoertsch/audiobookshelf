import { createFileRoute } from '@tanstack/react-router'
import { Providers } from '../features/admin/metadata'
export const Route = createFileRoute(
	'/config/item-metadata-utils/custom-metadata-providers',
)({ component: Providers })
