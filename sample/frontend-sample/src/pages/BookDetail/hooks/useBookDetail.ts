import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { BorrowBookAPI } from '@/apis/books/BorrowBookAPI'
import { DeleteBookAPI } from '@/apis/books/DeleteBookAPI'
import { GetBookAPI } from '@/apis/books/GetBookAPI'
import { ReturnLatestBorrowForBookAPI } from '@/apis/books/ReturnLatestBorrowForBookAPI'
import { BookInventoryStatuses, type BookInventoryStatus } from '@/objects/books/BookInventoryStatus'
import type { BookRecord } from '@/objects/books/BookRecord'
import { sendAPI } from '@/system/api/sendAPI'

export interface BookDetailViewData {
  id: string
  title: string
  author: string
  isbn: string
  category: string
  publisher: string
  shelf: string
  totalStock: number
  availableStock: number
  borrower: string
  borrowDate: string
  dueDate: string
  summary: string
}

export interface BookDetailState {
  book: BookDetailViewData
  status: BookInventoryStatus
  feedbackMessage: string
  lastRecordId: string
  lastAction: 'borrow' | 'return' | 'overdue' | ''
  isNewlyAdded: boolean
  isUpdated: boolean
  goToList: () => void
  goToHighlightedList: () => void
  goToEdit: () => void
  goToRecord: () => void
  goToReturnManage: () => void
  handleBorrow: () => Promise<void>
  handleReturn: () => Promise<void>
  handleDelete: () => Promise<void>
}

export function useBookDetail(): BookDetailState {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()

  const [status, setStatus] = useState<BookInventoryStatus>(BookInventoryStatuses.Available)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [lastRecordId, setLastRecordId] = useState('')
  const [lastAction, setLastAction] = useState<'borrow' | 'return' | 'overdue' | ''>('')
  const [bookData, setBookData] = useState<BookRecord | null>(null)

  const loadBook = async () => {
    if (!id) {
      return
    }

    try {
      const response = await sendAPI(new GetBookAPI(id))
      setBookData(response)
      setStatus(response.status === 'available' ? BookInventoryStatuses.Available : BookInventoryStatuses.Borrowed)
      setFeedbackMessage('')
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : '图书详情加载失败，请稍后重试。')
    }
  }

  useEffect(() => {
    void loadBook()
  }, [id])

  const book = useMemo(
    () => ({
      id: bookData?.id ?? id ?? 'UNKNOWN',
      title: bookData?.title ?? '图书详情加载中',
      author: bookData?.author ?? '-',
      isbn: bookData?.isbn ?? '-',
      category: bookData?.categoryLabel ?? '-',
      publisher: '馆藏系统',
      shelf: '默认书架',
      totalStock: bookData?.stockTotal ?? 0,
      availableStock: bookData?.stockAvailable ?? 0,
      borrower: status === BookInventoryStatuses.Borrowed ? '最近借阅人' : '',
      borrowDate: status === BookInventoryStatuses.Borrowed ? '见借阅记录' : '',
      dueDate: status === BookInventoryStatuses.Borrowed ? '见借阅记录' : '',
      summary: bookData?.summary ?? '正在从后端读取图书信息。',
    }),
    [bookData, id, status],
  )

  const handleBorrow = async () => {
    try {
      const record = await sendAPI(new BorrowBookAPI(book.id, '管理员代办读者'))
      setFeedbackMessage('')
      setLastRecordId(record.id)
      setLastAction('borrow')
      await loadBook()
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : '借书失败，请稍后重试。')
      setLastAction('')
    }
  }

  const handleReturn = async () => {
    try {
      const response = await sendAPI(new ReturnLatestBorrowForBookAPI(book.id))
      setFeedbackMessage('')
      setLastRecordId(response.record.id)
      setLastAction('return')
      await loadBook()
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : '还书失败，请稍后重试。')
      setLastAction('')
    }
  }

  const handleDelete = async () => {
    try {
      await sendAPI(new DeleteBookAPI(book.id))
      setFeedbackMessage('')
      navigate('/library/admin/book/list')
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : '该图书暂时不能删除。')
    }
  }

  return {
    book,
    status,
    feedbackMessage,
    lastRecordId,
    lastAction,
    isNewlyAdded: searchParams.get('source') === 'add',
    isUpdated: searchParams.get('updated') === '1',
    goToList: () => navigate('/library/admin/book/list'),
    goToHighlightedList: () => navigate(`/library/admin/book/list?highlight=${book.id}`),
    goToEdit: () => navigate(`/library/admin/book/edit/${book.id}`),
    goToRecord: () => navigate(`/library/admin/borrow/record/${lastRecordId}`),
    goToReturnManage: () =>
      navigate(`/library/admin/return/manage?bookId=${book.id}&bookName=${encodeURIComponent(book.title)}`),
    handleBorrow,
    handleReturn,
    handleDelete,
  }
}
