import { createFileRoute } from '@tanstack/react-router'
import { DebugIssues } from '../features/debug'

export const Route = createFileRoute('/debug/issues')({
	component: DebugIssues,
})
