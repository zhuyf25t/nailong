package services.books.tables.borrowrecord

import cats.effect.IO
import services.books.objects.*

import java.sql.{Connection, Date, PreparedStatement, ResultSet, Timestamp}
import java.time.{Instant, LocalDate}
import java.util.UUID

object BorrowRecordTable:

  private val insertSql: String =
    """
      |insert into borrow_records (id, book_id, reader_name, borrow_date, due_date, returned_date, status, created_at)
      |values (?, ?, ?, ?, ?, null, ?, ?)
      |returning id, book_id, reader_name, borrow_date, due_date, returned_date, status
      |""".stripMargin

  private[books] def insert(
    connection: Connection,
    book: BookRecord,
    readerName: String
  ): IO[BorrowRecord] =
    IO.blocking {
      val statement = connection.prepareStatement(insertSql)
      try
        val now = Instant.now()
        val borrowDate = LocalDate.now()
        val dueDate = borrowDate.plusDays(14)
        statement.setObject(1, UUID.randomUUID())
        statement.setObject(2, book.id.value)
        statement.setString(3, readerName.trim)
        statement.setDate(4, Date.valueOf(borrowDate))
        statement.setDate(5, Date.valueOf(dueDate))
        statement.setString(6, BorrowRecordStatus.toString(BorrowRecordStatus.Borrowing))
        statement.setTimestamp(7, Timestamp.from(now))

        val resultSet = statement.executeQuery()
        try
          if resultSet.next() then readBorrowRecord(resultSet, book.title)
          else throw new IllegalStateException("Borrow record insert returned no row")
        finally resultSet.close()
      finally statement.close()
    }

  private val listSql: String =
    """
      |select r.id, r.book_id, b.title as book_title, r.reader_name, r.borrow_date, r.due_date, r.returned_date, r.status
      |from borrow_records r
      |join books b on b.id = r.book_id
      |where (? = ''
      |  or lower(b.title) like ?
      |  or lower(r.reader_name) like ?
      |  or cast(r.id as varchar) like ?)
      |order by r.created_at desc
      |""".stripMargin

  private[books] def list(connection: Connection, keyword: String): IO[List[BorrowRecord]] =
    IO.blocking {
      val statement = connection.prepareStatement(listSql)
      try
        val normalized = keyword.trim.toLowerCase
        val like = s"%$normalized%"
        statement.setString(1, normalized)
        statement.setString(2, like)
        statement.setString(3, like)
        statement.setString(4, s"%${keyword.trim}%")
        val resultSet = statement.executeQuery()
        try
          val builder = List.newBuilder[BorrowRecord]
          while resultSet.next() do builder += readJoinedBorrowRecord(resultSet)
          builder.result()
        finally resultSet.close()
      finally statement.close()
    }

  private val findByIdSql: String =
    """
      |select r.id, r.book_id, b.title as book_title, r.reader_name, r.borrow_date, r.due_date, r.returned_date, r.status
      |from borrow_records r
      |join books b on b.id = r.book_id
      |where r.id = ?
      |""".stripMargin

  private[books] def findById(connection: Connection, id: BorrowRecordId): IO[Option[BorrowRecord]] =
    queryOne(connection.prepareStatement(findByIdSql)) { statement =>
      statement.setObject(1, id.value)
    }

  private val findByIdForUpdateSql: String =
    findByIdSql + " for update of r"

  private[books] def findByIdForUpdate(connection: Connection, id: BorrowRecordId): IO[Option[BorrowRecord]] =
    queryOne(connection.prepareStatement(findByIdForUpdateSql)) { statement =>
      statement.setObject(1, id.value)
    }

  private val findLatestActiveByBookForUpdateSql: String =
    """
      |select r.id, r.book_id, b.title as book_title, r.reader_name, r.borrow_date, r.due_date, r.returned_date, r.status
      |from borrow_records r
      |join books b on b.id = r.book_id
      |where r.book_id = ?
      |  and r.status = 'borrowing'
      |order by r.created_at desc
      |limit 1
      |for update of r
      |""".stripMargin

  private[books] def findLatestActiveByBookForUpdate(connection: Connection, bookId: BookId): IO[Option[BorrowRecord]] =
    queryOne(connection.prepareStatement(findLatestActiveByBookForUpdateSql)) { statement =>
      statement.setObject(1, bookId.value)
    }

  private val markReturnedSql: String =
    """
      |update borrow_records
      |set status = 'returned',
      |    returned_date = ?
      |where id = ?
      |  and status = 'borrowing'
      |""".stripMargin

  private[books] def markReturned(connection: Connection, id: BorrowRecordId, returnedDate: LocalDate): IO[Boolean] =
    IO.blocking {
      val statement = connection.prepareStatement(markReturnedSql)
      try
        statement.setDate(1, Date.valueOf(returnedDate))
        statement.setObject(2, id.value)
        statement.executeUpdate() == 1
      finally statement.close()
    }

  private val countActiveByBookSql: String =
    """
      |select count(*) as total
      |from borrow_records
      |where book_id = ?
      |  and status = 'borrowing'
      |""".stripMargin

  private[books] def countActiveByBook(connection: Connection, bookId: BookId): IO[Int] =
    IO.blocking {
      val statement = connection.prepareStatement(countActiveByBookSql)
      try
        statement.setObject(1, bookId.value)
        val resultSet = statement.executeQuery()
        try
          if resultSet.next() then resultSet.getInt("total")
          else 0
        finally resultSet.close()
      finally statement.close()
    }

  private def queryOne(statement: PreparedStatement)(bind: PreparedStatement => Unit): IO[Option[BorrowRecord]] =
    IO.blocking {
      try
        bind(statement)
        val resultSet = statement.executeQuery()
        try
          if resultSet.next() then Some(readJoinedBorrowRecord(resultSet))
          else None
        finally resultSet.close()
      finally statement.close()
    }

  private def readJoinedBorrowRecord(resultSet: ResultSet): BorrowRecord =
    readBorrowRecord(resultSet, resultSet.getString("book_title"))

  private def readBorrowRecord(resultSet: ResultSet, bookTitle: String): BorrowRecord =
    val returnedDate = Option(resultSet.getDate("returned_date")).map(_.toLocalDate)
    val dueDate = resultSet.getDate("due_date").toLocalDate
    BorrowRecord(
      id = BorrowRecordId(resultSet.getObject("id", classOf[java.util.UUID])),
      bookId = BookId(resultSet.getObject("book_id", classOf[java.util.UUID])),
      bookTitle = bookTitle,
      readerName = resultSet.getString("reader_name"),
      borrowDate = resultSet.getDate("borrow_date").toLocalDate,
      dueDate = dueDate,
      returnedDate = returnedDate,
      status = readStatus(resultSet.getString("status"), dueDate, returnedDate)
    )

  private def readStatus(
    value: String,
    dueDate: LocalDate,
    returnedDate: Option[LocalDate]
  ): BorrowRecordStatus =
    val storedStatus = BorrowRecordStatus.fromString(value).fold(
      message => throw new IllegalArgumentException(message),
      identity
    )

    storedStatus match
      case BorrowRecordStatus.Borrowing if returnedDate.isEmpty && dueDate.isBefore(LocalDate.now()) =>
        BorrowRecordStatus.Overdue
      case other => other
