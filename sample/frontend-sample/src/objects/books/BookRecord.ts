import type { BookId } from './BookId'
import type { BookInventoryStatus } from './BookInventoryStatus'
import type { InstantString } from './TimeCodecs'

export interface BookRecord {
  id: BookId
  title: string
  author: string
  isbn: string
  category: string
  categoryLabel: string
  stockTotal: number
  stockAvailable: number
  summary: string
  status: BookInventoryStatus
  createdAt: InstantString
  updatedAt: InstantString
}
