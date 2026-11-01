import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { CreateBookAPI } from '@/apis/books/CreateBookAPI'
import type { BookCategoryCode } from '@/pages/objects/BookCategory'
import { BookFormDraft } from '@/pages/objects/BookFormDraft'
import type { SaveBookRequest } from '@/pages/objects/SaveBookRequest'
import { sendAPI } from '@/system/api/sendAPI'

export interface AddBookFormState {
  title: string
  author: string
  isbn: string
  category: BookCategoryCode | ''
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
}

export function useAddBookForm(): AddBookFormState {
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [isbn, setIsbn] = useState('')
  const [category, setCategory] = useState<BookCategoryCode | ''>('')
  const [stock, setStock] = useState('')
  const [summary, setSummary] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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
      const book = await sendAPI(
        new CreateBookAPI(
          draft.title,
          draft.author,
          draft.isbn,
          draft.category,
          draft.parsedStock,
          draft.summary,
        ),
      )
      navigate(`/library/book/detail/${book.id}?source=add&highlight=${book.id}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '图书保存失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
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
  }
}
