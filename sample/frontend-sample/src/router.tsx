import { createBrowserRouter, Navigate } from 'react-router-dom'

import AddBook from '@/pages/AddBook'
import AdminDashboard from '@/pages/AdminDashboard'
import AdminLogin from '@/pages/AdminLogin'
import AdminRegister from '@/pages/AdminRegister'
import BookDetail from '@/pages/BookDetail'
import BookEdit from '@/pages/BookEdit'
import BookList from '@/pages/BookList'
import BorrowRecordDetail from '@/pages/BorrowRecordDetail'
import BorrowManage from '@/pages/BorrowManage'
import ReturnManage from '@/pages/ReturnManage'

const routes = [
  {
    path: '/',
    element: <Navigate replace to="/library/login" />,
  },
  {
    path: '/library/login',
    element: <AdminLogin />,
  },
  {
    path: '/library/register',
    element: <AdminRegister />,
  },
  {
    path: '/library/admin/dashboard',
    element: <AdminDashboard />,
  },
  {
    path: '/library/admin/book/add',
    element: <AddBook />,
  },
  {
    path: '/library/admin/book/list',
    element: <BookList />,
  },
  {
    path: '/library/admin/book/edit/:id',
    element: <BookEdit />,
  },
  {
    path: '/library/admin/borrow/manage',
    element: <BorrowManage />,
  },
  {
    path: '/library/admin/borrow/record/:id',
    element: <BorrowRecordDetail />,
  },
  {
    path: '/library/admin/return/manage',
    element: <ReturnManage />,
  },
  {
    path: '/library/book/detail/:id',
    element: <BookDetail />,
  },
  {
    path: '*',
    element: <Navigate replace to="/library/login" />,
  },
]

export const router = createBrowserRouter(routes)
