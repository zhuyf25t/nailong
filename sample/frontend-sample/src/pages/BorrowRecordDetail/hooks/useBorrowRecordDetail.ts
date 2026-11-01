import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { ListBorrowRecordsAPI } from '@/apis/books/ListBorrowRecordsAPI'
import {
  BorrowRecordStatuses,
  type BorrowRecordStatus,
} from '@/pages/objects/BorrowRecordDisplayStatus'
import { BorrowRecordEntity } from '@/pages/objects/BorrowRecordEntity'
import { toBorrowRecordEntity } from '@/pages/objects/mappers'
import { sendAPI } from '@/system/api/sendAPI'

import { resolveBorrowRecordProcess } from '../functions/resolveBorrowRecordProcess'

export interface BorrowRecordDetailState {
  record: BorrowRecordEntity
  process: string
  errorMessage: string
  goToBorrowManage: () => void
  goToReturnManage: () => void
  goToBookList: () => void
}

export function useBorrowRecordDetail(): BorrowRecordDetailState {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const [loadedRecord, setLoadedRecord] = useState<BorrowRecordEntity | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const fallbackRecord = useMemo(
    () =>
      new BorrowRecordEntity(
        id ?? 'BR-UNKNOWN',
        searchParams.get('bookName') ?? '图书借阅记录',
        searchParams.get('readerName') ?? '待确认读者',
        searchParams.get('borrowDate') ?? '2025-04-16',
        searchParams.get('dueDate') ?? '2025-04-30',
        (searchParams.get('status') as BorrowRecordStatus | null) ?? BorrowRecordStatuses.Borrowing,
        searchParams.get('returnDate') ?? '',
      ),
    [id, searchParams],
  )

  useEffect(() => {
    let isCancelled = false

    async function loadRecord() {
      try {
        const response = await sendAPI(new ListBorrowRecordsAPI())
        if (isCancelled) {
          return
        }

        const matchedRecord = response.records.map(toBorrowRecordEntity).find((record) => record.id === id)
        if (matchedRecord) {
          setLoadedRecord(matchedRecord)
          setErrorMessage('')
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : '借阅记录加载失败。')
        }
      }
    }

    void loadRecord()

    return () => {
      isCancelled = true
    }
  }, [id])

  const record = loadedRecord ?? fallbackRecord

  return {
    record,
    process: resolveBorrowRecordProcess(record),
    errorMessage,
    goToBorrowManage: () => navigate('/library/admin/borrow/manage'),
    goToReturnManage: () => navigate('/library/admin/return/manage'),
    goToBookList: () => navigate('/library/admin/book/list'),
  }
}
