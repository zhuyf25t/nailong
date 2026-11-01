import { APIWithTokenMessage } from '@/system/api/APIWithTokenMessage'
import type { BorrowRecordListResponse } from '@/objects/books/apiTypes/BorrowRecordListResponse'

export class ListBorrowRecordsAPI extends APIWithTokenMessage<BorrowRecordListResponse> {
  readonly keyword: string

  constructor(keyword: string = '') {
    super()
    this.keyword = keyword.trim()
  }
}
