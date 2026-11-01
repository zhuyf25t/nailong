package services.books.tables.borrowrecord

import cats.effect.IO

import java.sql.Connection

object BorrowRecordTableInitializer:

  private val initTableSql: String =
    """
      |create table if not exists borrow_records (
      |  id uuid primary key,
      |  book_id uuid not null references books(id) on delete restrict,
      |  reader_name varchar(100) not null,
      |  borrow_date date not null,
      |  due_date date not null,
      |  returned_date date,
      |  status varchar(24) not null check (status in ('borrowing', 'returned')),
      |  created_at timestamptz not null
      |);
      |
      |create index if not exists borrow_records_book_id_idx on borrow_records(book_id);
      |create index if not exists borrow_records_status_idx on borrow_records(status);
      |""".stripMargin

  def initialize(connection: Connection): IO[Unit] =
    IO.blocking {
      val statement = connection.createStatement()
      try statement.execute(initTableSql)
      finally statement.close()
    }
