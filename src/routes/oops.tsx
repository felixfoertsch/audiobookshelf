import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { safeReturnPath } from '../features/auth/navigation'
import { Button } from '../shared/components/ui/button'
export const Route = createFileRoute('/oops')({
	validateSearch: z.object({
		message: z.string().optional(),
		redirect: z.string().optional(),
	}),
	component: Oops,
})
function Oops() {
	const { message, redirect } = Route.useSearch()
	const navigate = useNavigate()
	return (
		<main className="mx-auto max-w-xl p-8">
			<h1 className="mb-6 text-2xl">Oops… {message}</h1>
			<Button onClick={() => void navigate({ to: safeReturnPath(redirect) })}>
				Return
			</Button>
		</main>
	)
}
