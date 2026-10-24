import { createFileRoute, redirect } from '@tanstack/react-router'
export const Route = createFileRoute('/items/$itemId')({
	beforeLoad: ({ params, location }) => {
		throw redirect({
			href: `${window.__ABS_WEB_CONFIG__?.basePath || ''}/item/${encodeURIComponent(params.itemId)}${location.searchStr}${location.hash ? `#${location.hash}` : ''}`,
			replace: true,
		})
	},
})
