import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { BorrowBookAPI } from '@/apis/books/BorrowBookAPI'
import { ListBorrowRecordsAPI } from '@/apis/books/ListBorrowRecordsAPI'
import { ReturnBorrowRecordAPI } from '@/apis/books/ReturnBorrowRecordAPI'
import { BorrowRecordStatuses } from '@/pages/objects/BorrowRecordDisplayStatus'
import { BorrowRecordEntity } from '@/pages/objects/BorrowRecordEntity'
import { toBorrowRecordEntity } from '@/pages/objects/mappers'
import { sendAPI } from '@/system/api/sendAPI'

export interface BorrowManageState {
  records: BorrowRecordEntity[]
  bookIdInput: string
  readerName: string
  inlineMessage: string
  pendingBookName: string | null
  pendingBookId: string | null
  activeCount: number
  setBookIdInput: (value: string) => void
  setReaderName: (value: string) => void
  createBorrow: () => Promise<void>
  returnBook: (recordId: string) => Promise<void>
  goToRecord: (recordId: string) => void
}

export function useBorrowManage(): BorrowManageState {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [records, setRecords] = useState<BorrowRecordEntity[]>([])
  const [bookIdInput, setBookIdInput] = useState(searchParams.get('bookId') ?? '')
  const [readerName, setReaderName] = useState('代办读者')
  const [inlineMessage, setInlineMessage] = useState('')

  const pendingBookName = searchParams.get('bookName')
  const pendingBookId = searchParams.get('bookId')

  const activeCount = useMemo(
    () => records.filter((record) => record.status !== BorrowRecordStatuses.Returned).length,
    [records],
  )

  const loadRecords = async () => {
    try {
      const response = await sendAPI(new ListBorrowRecordsAPI())
      setRecords(response.records.map(toBorrowRecordEntity))
      setInlineMessage('')
    } catch (error) {
      setInlineMessage(error instanceof Error ? error.message : '借阅记录加载失败，请稍后重试。')
    }
  }

  useEffect(() => {
    void loadRecords()
  }, [])

  const createBorrow = async () => {
    const bookId = bookIdInput.trim()
    if (!bookId) {
      setInlineMessage('请输入图书编号后再登记借书。')
      return
    }

    try {
      const record = await sendAPI(new BorrowBookAPI(bookId, readerName.trim() || '代办读者'))
      setRecords((current) => [toBorrowRecordEntity(record), ...current])
      setInlineMessage('')
    } catch (error) {
      setInlineMessage(error instanceof Error ? error.message : '借书登记失败，请稍后重试。')
    }
  }

  const returnBook = async (recordId: string) => {
    try {
      const response = await sendAPI(new ReturnBorrowRecordAPI(recordId))
      setRecords((current) =>
        current.map((item) => (item.id === recordId ? toBorrowRecordEntity(response.record) : item)),
      )
      setInlineMessage('归还办理完成。')
    } catch (error) {
      setInlineMessage(error instanceof Error ? error.message : '归还办理失败，请稍后重试。')
    }
  }

  return {
    records,
    bookIdInput,
    readerName,
    inlineMessage,
    pendingBookName,
    pendingBookId,
    activeCount,
    setBookIdInput,
    setReaderName,
    createBorrow,
    returnBook,
    goToRecord: (recordId) => navigate(`/library/admin/borrow/record/${recordId}`),
  }
}
