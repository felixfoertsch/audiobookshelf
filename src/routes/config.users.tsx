import { createFileRoute, Outlet } from '@tanstack/react-router'
export const Route = createFileRoute('/config/users')({
	component: () => <Outlet />,
})
