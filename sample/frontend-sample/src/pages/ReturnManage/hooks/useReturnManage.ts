import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ListBorrowRecordsAPI } from '@/apis/books/ListBorrowRecordsAPI'
import { ReturnBorrowRecordAPI } from '@/apis/books/ReturnBorrowRecordAPI'
import { ReturnRecordEntity } from '@/pages/objects/ReturnRecordEntity'
import { toReturnRecordEntity } from '@/pages/objects/mappers'
import { sendAPI } from '@/system/api/sendAPI'

export interface ReturnManageState {
  keyword: string
  filteredRecords: ReturnRecordEntity[]
  isSearching: boolean
  inlineMessage: string
  pendingBookName: string | null
  pendingBookId: string | null
  setKeyword: (value: string) => void
  searchRecords: () => void
  returnRecord: (recordId: string) => Promise<void>
}

export function useReturnManage(): ReturnManageState {
  const [searchParams] = useSearchParams()

  const [keyword, setKeyword] = useState('')
  const [records, setRecords] = useState<ReturnRecordEntity[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [inlineMessage, setInlineMessage] = useState('')

  const pendingBookName = searchParams.get('bookName')
  const pendingBookId = searchParams.get('bookId')

  const filteredRecords = useMemo(() => {
    const trimmedKeyword = keyword.trim().toLowerCase()
    if (!trimmedKeyword) {
      return records
    }

    return records.filter((record) =>
      [record.bookTitle, record.readerName, record.borrowCode, record.id]
        .join(' ')
        .toLowerCase()
        .includes(trimmedKeyword),
    )
  }, [keyword, records])

  const loadRecords = async (nextKeyword = '') => {
    setIsSearching(true)
    try {
      const response = await sendAPI(new ListBorrowRecordsAPI(nextKeyword.trim()))
      setRecords(response.records.map(toReturnRecordEntity))
      setInlineMessage('')
    } catch (error) {
      setInlineMessage(error instanceof Error ? error.message : '检索失败，请稍后重试。')
    } finally {
      setIsSearching(false)
    }
  }

  useEffect(() => {
    void loadRecords()
  }, [])

  const returnRecord = async (recordId: string) => {
    try {
      const response = await sendAPI(new ReturnBorrowRecordAPI(recordId))
      setRecords((current) =>
        current.map((record) => (record.id === recordId ? toReturnRecordEntity(response.record) : record)),
      )
      setInlineMessage('还书已办理完成。')
    } catch (error) {
      setInlineMessage(error instanceof Error ? error.message : '还书办理失败，请稍后重新提交。')
    }
  }

  return {
    keyword,
    filteredRecords,
    isSearching,
    inlineMessage,
    pendingBookName,
    pendingBookId,
    setKeyword,
    searchRecords: () => void loadRecords(keyword),
    returnRecord,
  }
}
