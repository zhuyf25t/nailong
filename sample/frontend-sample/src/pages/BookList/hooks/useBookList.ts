import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { DeleteBookAPI } from '@/apis/books/DeleteBookAPI'
import { ListBooksAPI } from '@/apis/books/ListBooksAPI'
import { BookCatalogRecord } from '@/pages/objects/BookCatalogRecord'
import { toBookCatalogRecord } from '@/pages/objects/mappers'
import { sendAPI } from '@/system/api/sendAPI'

export interface BookListState {
  keyword: string
  highlightedId: string | null
  inlineMessage: string
  isLoading: boolean
  filteredBooks: BookCatalogRecord[]
  setKeyword: (value: string) => void
  loadBooks: () => Promise<void>
  goToAddBook: () => void
  goToBookDetail: (bookId: string) => void
  goToBookEdit: (bookId: string) => void
  goToBorrow: (book: BookCatalogRecord) => void
  goToReturn: (book: BookCatalogRecord) => void
  deleteBook: (book: BookCatalogRecord) => Promise<void>
}

export function useBookList(): BookListState {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [books, setBooks] = useState<BookCatalogRecord[]>([])
  const [keyword, setKeyword] = useState('')
  const [inlineMessage, setInlineMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const highlightedId = searchParams.get('highlight')

  const loadBooks = async () => {
    setIsLoading(true)
    try {
      const response = await sendAPI(new ListBooksAPI())
      setBooks(response.books.map(toBookCatalogRecord))
      setInlineMessage('')
    } catch (error) {
      setInlineMessage(error instanceof Error ? error.message : '图书列表加载失败，请稍后重试。')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadBooks()
  }, [])

  const filteredBooks = useMemo(() => {
    const trimmedKeyword = keyword.trim().toLowerCase()

    if (!trimmedKeyword) {
      return books
    }

    return books.filter((book) =>
      [book.title, book.author, book.categoryLabel, book.isbn, book.id]
        .join(' ')
        .toLowerCase()
        .includes(trimmedKeyword),
    )
  }, [books, keyword])

  const deleteBook = async (book: BookCatalogRecord) => {
    try {
      await sendAPI(new DeleteBookAPI(book.id))
      setInlineMessage('')
      setBooks((current) => current.filter((item) => item.id !== book.id))
    } catch (error) {
      setInlineMessage(error instanceof Error ? error.message : `《${book.title}》暂时无法删除。`)
    }
  }

  return {
    keyword,
    highlightedId,
    inlineMessage,
    isLoading,
    filteredBooks,
    setKeyword,
    loadBooks,
    goToAddBook: () => navigate('/library/admin/book/add'),
    goToBookDetail: (bookId) => navigate(`/library/book/detail/${bookId}`),
    goToBookEdit: (bookId) => navigate(`/library/admin/book/edit/${bookId}`),
    goToBorrow: (book) =>
      navigate(`/library/admin/borrow/manage?bookId=${book.id}&bookName=${encodeURIComponent(book.title)}`),
    goToReturn: (book) =>
      navigate(`/library/admin/return/manage?bookId=${book.id}&bookName=${encodeURIComponent(book.title)}`),
    deleteBook,
  }
}
