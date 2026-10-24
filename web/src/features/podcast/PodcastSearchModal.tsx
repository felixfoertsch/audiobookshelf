import { useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '../../shared/components/ui/dialog'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from '../../shared/components/ui/sheet'
import { useIsMobile } from '../../shared/hooks/use-mobile'
import { PodcastSearch } from './index'

export function PodcastSearchModal({ libraryId }: { libraryId: string }) {
	const mobile = useIsMobile()
	const navigate = useNavigate()
	const router = useRouter()
	const returnFocus = useRef<HTMLElement | null>(null)
	useEffect(() => {
		returnFocus.current =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null
	}, [])
	const close = () => {
		if (router.history.canGoBack()) router.history.back()
		else
			void navigate({
				to: '.',
				search: (previous) => {
					const { addPodcast: _addPodcast, ...rest } = previous as Record<
						string,
						unknown
					>
					return rest
				},
				replace: true,
			} as Parameters<typeof navigate>[0])
	}
	const restoreFocus = (event: Event) => {
		event.preventDefault()
		requestAnimationFrame(() => {
			const trigger =
				returnFocus.current?.isConnected &&
				returnFocus.current !== document.body
					? returnFocus.current
					: document.querySelector<HTMLElement>(
							'a[href*="addPodcast=1"], a[href$="/podcast/search"]',
						)
			trigger?.focus()
		})
	}
	if (mobile)
		return (
			<Sheet
				open
				onOpenChange={(open) => {
					if (!open) close()
				}}
			>
				<SheetContent
					side="bottom"
					className="max-h-[95dvh] overflow-y-auto rounded-t-xl p-5 [&>button]:min-h-6 [&>button]:min-w-6 [@media(pointer:coarse)]:[&>button]:min-h-11 [@media(pointer:coarse)]:[&>button]:min-w-11"
					onCloseAutoFocus={restoreFocus}
					onEscapeKeyDown={(event) => {
						const nested =
							document.querySelector<HTMLDialogElement>('dialog[open]')
						if (nested) {
							event.preventDefault()
							nested.requestClose()
						}
					}}
				>
					<SheetHeader className="p-0 pr-8">
						<SheetTitle>Add podcast</SheetTitle>
						<SheetDescription>
							Find a podcast or subscribe using its RSS URL.
						</SheetDescription>
					</SheetHeader>
					<PodcastSearch libraryId={libraryId} />
				</SheetContent>
			</Sheet>
		)
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) close()
			}}
		>
			<DialogContent
				className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl [&>button]:min-h-6 [&>button]:min-w-6 [@media(pointer:coarse)]:[&>button]:min-h-11 [@media(pointer:coarse)]:[&>button]:min-w-11"
				onCloseAutoFocus={restoreFocus}
				onEscapeKeyDown={(event) => {
					const nested =
						document.querySelector<HTMLDialogElement>('dialog[open]')
					if (nested) {
						event.preventDefault()
						nested.requestClose()
					}
				}}
			>
				<DialogHeader>
					<DialogTitle>Add podcast</DialogTitle>
					<DialogDescription>
						Find a podcast or subscribe using its RSS URL.
					</DialogDescription>
				</DialogHeader>
				<PodcastSearch libraryId={libraryId} />
			</DialogContent>
		</Dialog>
	)
}
