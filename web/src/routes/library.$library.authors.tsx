import { createFileRoute, redirect } from '@tanstack/react-router'
export const Route = createFileRoute('/library/$library/authors')({
	beforeLoad: ({ params, location }) => {
		throw redirect({
			to: '/library/$library/bookshelf/$id',
			params: { library: params.library, id: 'authors' },
			search: location.search,
			hash: location.hash,
		})
	},
})
