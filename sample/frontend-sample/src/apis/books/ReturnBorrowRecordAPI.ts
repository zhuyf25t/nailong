import { APIWithTokenMessage } from '@/system/api/APIWithTokenMessage'
import type { ReturnBookResponse } from '@/objects/books/apiTypes/ReturnBookResponse'

export class ReturnBorrowRecordAPI extends APIWithTokenMessage<ReturnBookResponse> {
  readonly recordId: string

  constructor(recordId: string) {
    super()
    this.recordId = recordId
  }
}
