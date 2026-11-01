import { BorrowRecordStatuses } from '@/pages/objects/BorrowRecordDisplayStatus'
import type { BorrowRecordEntity } from '@/pages/objects/BorrowRecordEntity'

export function resolveBorrowRecordProcess(record: BorrowRecordEntity) {
  if (record.status === BorrowRecordStatuses.Returned) {
    return '归还流程已完成，可回看借阅与归还时间。'
  }

  if (record.status === BorrowRecordStatuses.Overdue) {
    return '记录已进入逾期状态，管理员可继续跟进归还。'
  }

  return '已完成借书登记，等待按期归还。'
}
