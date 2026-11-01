export const BookInventoryStatuses = {
  Available: 'available',
  Borrowed: 'borrowed',
} as const

export type BookInventoryStatus =
  (typeof BookInventoryStatuses)[keyof typeof BookInventoryStatuses]
