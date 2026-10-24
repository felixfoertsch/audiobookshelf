import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useAuth } from '../api'

export const Route = createFileRoute('/config/item-metadata-utils')({
	beforeLoad: () => {
		if (
			useAuth.getState().user?.type !== 'root' &&
			useAuth.getState().user?.type !== 'admin'
		)
			throw redirect({ to: '/' })
	},
	component: () => <Outlet />,
})
