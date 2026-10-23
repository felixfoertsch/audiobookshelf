import { CheckSquare, ListChecks } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '../../shared/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '../../shared/components/ui/dropdown-menu'

export function SelectionToolbar({
	count,
	selectAll,
	clear,
	done,
	pending,
	podcast,
	mark,
	play,
	children,
}: {
	count: number
	selectAll: () => void
	clear: () => void
	done: () => void
	pending: boolean
	podcast: boolean
	mark: (finished: boolean) => void
	play: () => void
	children: ReactNode
}) {
	return (
		<section
			aria-label="Selection"
			className="fixed inset-x-3 bottom-24 z-30 mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg"
		>
			<span role="status" className="text-sm tabular-nums">
				{count} selected
			</span>
			<Button size="sm" variant="outline" onClick={selectAll}>
				<CheckSquare />
				Select page
			</Button>
			<Button size="sm" variant="outline" onClick={clear}>
				Clear selection ({count})
			</Button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button size="sm" variant="outline" disabled={!count || pending}>
						<ListChecks />
						Bulk actions
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem onSelect={() => mark(true)}>
						{podcast ? 'Mark all episodes finished' : 'Mark finished'}
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => mark(false)}>
						{podcast ? 'Mark all episodes unfinished' : 'Mark unfinished'}
					</DropdownMenuItem>
					{!podcast && (
						<DropdownMenuItem onSelect={play}>Play selected</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			{children}
			<Button size="sm" onClick={done}>
				Done
			</Button>
		</section>
	)
}
