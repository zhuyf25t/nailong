package services.books.tables.book

import cats.effect.IO
import services.books.objects.{BookId, BookInventoryStatus, BookRecord, BookSaveData}

import java.sql.{Connection, PreparedStatement, ResultSet, Timestamp}
import java.time.Instant
import java.util.UUID

object BookTable:

  private val insertSql: String =
    """
      |insert into books (id, title, author, isbn, category, stock_total, stock_available, summary, created_at, updated_at)
      |values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      |returning id, title, author, isbn, category, stock_total, stock_available, summary, created_at, updated_at
      |""".stripMargin

  private[books] def insert(connection: Connection, request: BookSaveData): IO[BookRecord] =
    IO.blocking {
      val statement = connection.prepareStatement(insertSql)
      try
        val now = Instant.now()
        statement.setObject(1, UUID.randomUUID())
        bindSaveFields(statement, 2, request)
        statement.setInt(6, request.stock)
        statement.setInt(7, request.stock)
        statement.setString(8, request.summary.trim)
        statement.setTimestamp(9, Timestamp.from(now))
        statement.setTimestamp(10, Timestamp.from(now))

        val resultSet = statement.executeQuery()
        try
          if resultSet.next() then readBook(resultSet)
          else throw new IllegalStateException("Book insert returned no row")
        finally resultSet.close()
      finally statement.close()
    }

  private val listSql: String =
    """
      |select id, title, author, isbn, category, stock_total, stock_available, summary, created_at, updated_at
      |from books
      |where (? = ''
      |  or lower(title) like ?
      |  or lower(author) like ?
      |  or lower(category) like ?
      |  or isbn like ?)
      |order by updated_at desc
      |""".stripMargin

  private[books] def list(connection: Connection, keyword: String): IO[List[BookRecord]] =
    IO.blocking {
      val statement = connection.prepareStatement(listSql)
      try
        val normalized = keyword.trim.toLowerCase
        val like = s"%$normalized%"
        statement.setString(1, normalized)
        statement.setString(2, like)
        statement.setString(3, like)
        statement.setString(4, like)
        statement.setString(5, s"%${keyword.trim}%")
        val resultSet = statement.executeQuery()
        try readBooks(resultSet)
        finally resultSet.close()
      finally statement.close()
    }

  private val findByIdSql: String =
    """
      |select id, title, author, isbn, category, stock_total, stock_available, summary, created_at, updated_at
      |from books
      |where id = ?
      |""".stripMargin

  private[books] def findById(connection: Connection, id: BookId): IO[Option[BookRecord]] =
    queryOne(connection.prepareStatement(findByIdSql)) { statement =>
      statement.setObject(1, id.value)
    }

  private val lockByIdSql: String =
    findByIdSql + " for update"

  private[books] def lockById(connection: Connection, id: BookId): IO[Option[BookRecord]] =
    queryOne(connection.prepareStatement(lockByIdSql)) { statement =>
      statement.setObject(1, id.value)
    }

  private val findByIsbnSql: String =
    """
      |select id, title, author, isbn, category, stock_total, stock_available, summary, created_at, updated_at
      |from books
      |where isbn = ?
      |""".stripMargin

  private[books] def findByIsbn(connection: Connection, isbn: String): IO[Option[BookRecord]] =
    queryOne(connection.prepareStatement(findByIsbnSql)) { statement =>
      statement.setString(1, isbn.trim)
    }

  private val findByIsbnExceptIdSql: String =
    """
      |select id, title, author, isbn, category, stock_total, stock_available, summary, created_at, updated_at
      |from books
      |where isbn = ?
      |  and id <> ?
      |""".stripMargin

  private[books] def findByIsbnExceptId(connection: Connection, isbn: String, id: BookId): IO[Option[BookRecord]] =
    queryOne(connection.prepareStatement(findByIsbnExceptIdSql)) { statement =>
      statement.setString(1, isbn.trim)
      statement.setObject(2, id.value)
    }

  private val updateSql: String =
    """
      |update books
      |set title = ?,
      |    author = ?,
      |    isbn = ?,
      |    category = ?,
      |    stock_total = ?,
      |    stock_available = ?,
      |    summary = ?,
      |    updated_at = ?
      |where id = ?
      |returning id, title, author, isbn, category, stock_total, stock_available, summary, created_at, updated_at
      |""".stripMargin

  private[books] def update(
    connection: Connection,
    id: BookId,
    request: BookSaveData,
    availableStock: Int
  ): IO[Option[BookRecord]] =
    IO.blocking {
      val statement = connection.prepareStatement(updateSql)
      try
        bindSaveFields(statement, 1, request)
        statement.setInt(5, request.stock)
        statement.setInt(6, availableStock)
        statement.setString(7, request.summary.trim)
        statement.setTimestamp(8, Timestamp.from(Instant.now()))
        statement.setObject(9, id.value)

        val resultSet = statement.executeQuery()
        try
          if resultSet.next() then Some(readBook(resultSet))
          else None
        finally resultSet.close()
      finally statement.close()
    }

  private val decrementAvailableSql: String =
    """
      |update books
      |set stock_available = stock_available - 1,
      |    updated_at = ?
      |where id = ?
      |  and stock_available > 0
      |""".stripMargin

  private[books] def decrementAvailable(connection: Connection, id: BookId): IO[Boolean] =
    updateStock(connection, decrementAvailableSql, id)

  private val incrementAvailableSql: String =
    """
      |update books
      |set stock_available = stock_available + 1,
      |    updated_at = ?
      |where id = ?
      |  and stock_available < stock_total
      |""".stripMargin

  private[books] def incrementAvailable(connection: Connection, id: BookId): IO[Boolean] =
    updateStock(connection, incrementAvailableSql, id)

  private val deleteSql: String =
    """
      |delete from books
      |where id = ?
      |""".stripMargin

  private[books] def delete(connection: Connection, id: BookId): IO[Boolean] =
    IO.blocking {
      val statement = connection.prepareStatement(deleteSql)
      try
        statement.setObject(1, id.value)
        statement.executeUpdate() == 1
      finally statement.close()
    }

  private def updateStock(connection: Connection, sql: String, id: BookId): IO[Boolean] =
    IO.blocking {
      val statement = connection.prepareStatement(sql)
      try
        statement.setTimestamp(1, Timestamp.from(Instant.now()))
        statement.setObject(2, id.value)
        statement.executeUpdate() == 1
      finally statement.close()
    }

  private def bindSaveFields(statement: PreparedStatement, startIndex: Int, request: BookSaveData): Unit =
    statement.setString(startIndex, request.title.trim)
    statement.setString(startIndex + 1, request.author.trim)
    statement.setString(startIndex + 2, request.isbn.trim)
    statement.setString(startIndex + 3, request.category.trim)

  private def queryOne(statement: PreparedStatement)(bind: PreparedStatement => Unit): IO[Option[BookRecord]] =
    IO.blocking {
      try
        bind(statement)
        val resultSet = statement.executeQuery()
        try
          if resultSet.next() then Some(readBook(resultSet))
          else None
        finally resultSet.close()
      finally statement.close()
    }

  private def readBooks(resultSet: ResultSet): List[BookRecord] =
    val builder = List.newBuilder[BookRecord]
    while resultSet.next() do builder += readBook(resultSet)
    builder.result()

  private def readBook(resultSet: ResultSet): BookRecord =
    val stockAvailable = resultSet.getInt("stock_available")
    val category = resultSet.getString("category")
    BookRecord(
      id = BookId(resultSet.getObject("id", classOf[java.util.UUID])),
      title = resultSet.getString("title"),
      author = resultSet.getString("author"),
      isbn = resultSet.getString("isbn"),
      category = category,
      categoryLabel = categoryLabel(category),
      stockTotal = resultSet.getInt("stock_total"),
      stockAvailable = stockAvailable,
      summary = resultSet.getString("summary"),
      status =
        if stockAvailable > 0 then BookInventoryStatus.Available
        else BookInventoryStatus.Borrowed,
      createdAt = resultSet.getTimestamp("created_at").toInstant,
      updatedAt = resultSet.getTimestamp("updated_at").toInstant
    )

  private def categoryLabel(category: String): String =
    category.trim.toLowerCase match
      case "computer" => "计算机"
      case "literature" => "文学"
      case "history" => "历史"
      case "management" => "管理"
      case "scifi" => "科幻"
      case "novel" => "小说"
      case other if other.nonEmpty => other
      case _ => "未分类"
