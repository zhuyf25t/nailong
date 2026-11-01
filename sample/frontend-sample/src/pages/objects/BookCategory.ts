export const BookCategoryCodes = {
  Computer: 'computer',
  Literature: 'literature',
  History: 'history',
  Management: 'management',
  SciFi: 'scifi',
  Novel: 'novel',
} as const

export type BookCategoryCode = (typeof BookCategoryCodes)[keyof typeof BookCategoryCodes]
