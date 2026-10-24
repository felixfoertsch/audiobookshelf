import { createFileRoute, redirect } from '@tanstack/react-router'
export const Route = createFileRoute('/library/$library/series/')({
	beforeLoad: () => {
		throw redirect({ to: '/oops', search: { message: 'Series not found' } })
	},
})
