import { createFileRoute } from '@tanstack/react-router'
import { LibrariesPage } from '../features/admin/libraries'

export const Route = createFileRoute('/config/libraries')({
	component: LibrariesPage,
})
