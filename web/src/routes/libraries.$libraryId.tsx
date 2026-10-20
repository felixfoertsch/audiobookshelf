import { createFileRoute, redirect } from '@tanstack/react-router'
import { browseSearch } from '../features/catalog/browse-api'

export const Route = createFileRoute('/libraries/$libraryId')({
	validateSearch: browseSearch,
	beforeLoad: ({ params, search, location }) => {
		throw redirect({
			to: '/library/$library/bookshelf',
			params: { library: params.libraryId },
			search,
			hash: location.hash,
		})
	},
})
