import { parseDateTime } from '@internationalized/date'
import { Fragment } from 'react'
import {
	DateField,
	DateInput,
	DateSegment,
	I18nProvider,
	Label,
} from 'react-aria-components'

const parts = ['year', 'month', 'day', 'hour', 'minute'] as const
const separators = ['-', '-', ' ', ':', '']
export function IsoDateTimeField({
	label,
	value,
	onChange,
	isDisabled = false,
}: {
	label: string
	value: string
	onChange: (value: string) => void
	isDisabled?: boolean
}) {
	return (
		<I18nProvider locale="en-GB-u-ca-iso8601-nu-latn">
			<DateField
				value={value ? parseDateTime(value) : null}
				onChange={(next) => onChange(next?.toString().slice(0, 16) || '')}
				isDisabled={isDisabled}
				hourCycle={24}
				granularity="minute"
				className="space-y-1"
			>
				{({ state }) => (
					<>
						<Label>{label}</Label>
						<DateInput className="flex w-fit max-w-full rounded-md border bg-background px-3 py-2 font-mono focus-within:ring-2 focus-within:ring-ring">
							{(segment) =>
								segment.type === 'year' ? (
									<span className="contents">
										{parts.map((part, index) => {
											const field = state.segments.find(
												(entry) => entry.type === part,
											)
											return field ? (
												<Fragment key={part}>
													<DateSegment
														segment={field}
														className="rounded focus:bg-accent focus:outline-none"
													>
														{({ isPlaceholder, value: number }) =>
															isPlaceholder
																? part === 'year'
																	? 'YYYY'
																	: part === 'month'
																		? 'MM'
																		: part === 'day'
																			? 'DD'
																			: part === 'hour'
																				? 'HH'
																				: 'MM'
																: String(number).padStart(
																		part === 'year' ? 4 : 2,
																		'0',
																	)
														}
													</DateSegment>
													<span aria-hidden="true" className="whitespace-pre">
														{separators[index]}
													</span>
												</Fragment>
											) : null
										})}
									</span>
								) : (
									<Fragment />
								)
							}
						</DateInput>
					</>
				)}
			</DateField>
		</I18nProvider>
	)
}
