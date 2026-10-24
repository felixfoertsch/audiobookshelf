import type { ReactNode } from 'react'
import { Button } from '../../shared/components/ui/button'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '../../shared/components/ui/sheet'

export function WorkflowSheet({
	title,
	description,
	children,
	open,
	onOpenChange,
}: {
	title: string
	description: string
	open?: boolean
	onOpenChange?: (open: boolean) => void
	children: ReactNode
}) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetTrigger asChild>
				<Button variant="outline">{title}</Button>
			</SheetTrigger>
			<SheetContent className="w-full overflow-y-auto p-4 sm:max-w-2xl">
				<SheetHeader>
					<SheetTitle>{title}</SheetTitle>
					<SheetDescription>{description}</SheetDescription>
				</SheetHeader>
				{children}
			</SheetContent>
		</Sheet>
	)
}
