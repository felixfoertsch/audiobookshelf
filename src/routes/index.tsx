import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuth } from '../api'
import { getLibraries } from '../catalog'

export const Route = createFileRoute('/')({
	loader: async () => {
		const { libraries } = await getLibraries()
		const current =
			localStorage.getItem('currentLibraryId') ||
			useAuth.getState().defaultLibraryId
		const library =
			libraries.find((item) => item.id === current) || libraries[0]
		if (!library)
			throw redirect({ to: '/oops', search: { message: 'No libraries' } })
		throw redirect({ to: '/library/$library', params: { library: library.id } })
	},
})
