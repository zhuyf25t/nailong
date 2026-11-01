import {
  BookCopy,
  BookMinus,
  BookPlus,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'

export interface DashboardAction {
  id: string
  title: string
  description: string
  icon: LucideIcon
  buttonText: string
  targetPath: string
}

export const dashboardActions: DashboardAction[] = [
  {
    id: 'borrow-book',
    title: '借书登记',
    description: '登记读者借阅图书，确认借出信息。',
    icon: BookCopy,
    buttonText: '开始借书',
    targetPath: '/library/admin/borrow/manage',
  },
  {
    id: 'return-book',
    title: '还书处理',
    description: '处理读者归还图书，更新馆藏状态。',
    icon: RotateCcw,
    buttonText: '处理还书',
    targetPath: '/library/admin/return/manage',
  },
  {
    id: 'add-book',
    title: '添加图书',
    description: '录入新书资料，扩充馆藏目录。',
    icon: BookPlus,
    buttonText: '添加图书',
    targetPath: '/library/admin/book/add',
  },
  {
    id: 'delete-book',
    title: '删除图书',
    description: '移除不再保留的图书记录。',
    icon: BookMinus,
    buttonText: '删除图书',
    targetPath: '/library/admin/book/list',
  },
]
