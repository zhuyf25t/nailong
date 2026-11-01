import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { GetBookAPI } from '@/apis/books/GetBookAPI'
import { UpdateBookAPI } from '@/apis/books/UpdateBookAPI'
import { BookCategoryCodes, type BookCategoryCode } from '@/pages/objects/BookCategory'
import { BookFormDraft } from '@/pages/objects/BookFormDraft'
import type { SaveBookRequest } from '@/pages/objects/SaveBookRequest'
import { sendAPI } from '@/system/api/sendAPI'

export interface BookEditFormState {
  id: string | undefined
  title: string
  author: string
  isbn: string
  category: BookCategoryCode
  stock: string
  summary: string
  errorMessage: string
  isSubmitting: boolean
  setTitle: (value: string) => void
  setAuthor: (value: string) => void
  setIsbn: (value: string) => void
  setCategory: (value: BookCategoryCode) => void
  setStock: (value: string) => void
  setSummary: (value: string) => void
  handleSubmit: () => Promise<void>
  goToDetail: () => void
}

export function useBookEditForm(): BookEditFormState {
  const navigate = useNavigate()
  const { id } = useParams()

  const [title, setTitle] = useState(id === 'BK-1002' ? '三体' : '百年孤独')
  const [author, setAuthor] = useState(id === 'BK-1002' ? '刘慈欣' : '加西亚·马尔克斯')
  const [isbn, setIsbn] = useState(id === 'BK-1002' ? '9787536692930' : '9787544291170')
  const [category, setCategory] = useState<BookCategoryCode>(
    id === 'BK-1002' ? BookCategoryCodes.Computer : BookCategoryCodes.Literature,
  )
  const [stock, setStock] = useState(id === 'BK-1002' ? '2' : '4')
  const [summary, setSummary] = useState(
    id === 'BK-1002'
      ? '文明冲突与宇宙社会学交织展开的科幻长篇。'
      : '布恩迪亚家族七代人的命运在马孔多小镇交织展开。',
  )
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!id) {
      return
    }

    let isCancelled = false

    async function loadBook() {
      try {
        const book = await sendAPI(new GetBookAPI(id!))
        if (isCancelled) {
          return
        }

        setTitle(book.title)
        setAuthor(book.author)
        setIsbn(book.isbn)
        setCategory(book.category as BookCategoryCode)
        setStock(String(book.stockTotal))
        setSummary(book.summary)
        setErrorMessage('')
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : '图书信息加载失败。')
        }
      }
    }

    void loadBook()

    return () => {
      isCancelled = true
    }
  }, [id])

  const handleSubmit = async () => {
    const request: SaveBookRequest = {
      draft: BookFormDraft.fromForm(title, author, isbn, category, stock, summary),
    }

    if (!request.draft.isComplete) {
      setErrorMessage('请完整填写图书信息。')
      return
    }

    if (!request.draft.hasValidStock) {
      setErrorMessage('库存数量需为大于 0 的整数。')
      return
    }

    setErrorMessage('')
    setIsSubmitting(true)

    try {
      const draft = request.draft
      await sendAPI(
        new UpdateBookAPI(
          id ?? '',
          draft.title,
          draft.author,
          draft.isbn,
          draft.category,
          draft.parsedStock,
          draft.summary,
        ),
      )
      navigate(`/library/book/detail/${id}?updated=1`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '图书信息保存失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  const goToDetail = () => {
    navigate(`/library/book/detail/${id}`)
  }

  return {
    id,
    title,
    author,
    isbn,
    category,
    stock,
    summary,
    errorMessage,
    isSubmitting,
    setTitle,
    setAuthor,
    setIsbn,
    setCategory,
    setStock,
    setSummary,
    handleSubmit,
    goToDetail,
  }
}
