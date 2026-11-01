package services.books.tables.book

import cats.effect.IO
import cats.syntax.all.*

import java.sql.{Connection, Timestamp}
import java.time.Instant
import java.util.UUID

object BookTableInitializer:

  private val initTableSql: String =
    """
      |create table if not exists books (
      |  id uuid primary key,
      |  title varchar(160) not null,
      |  author varchar(120) not null,
      |  isbn varchar(40) unique not null,
      |  category varchar(60) not null,
      |  stock_total integer not null check (stock_total > 0),
      |  stock_available integer not null check (stock_available >= 0),
      |  summary text not null,
      |  created_at timestamptz not null,
      |  updated_at timestamptz not null,
      |  check (stock_available <= stock_total)
      |);
      |
      |create index if not exists books_title_idx on books(title);
      |create index if not exists books_isbn_idx on books(isbn);
      |""".stripMargin

  private val countSql: String =
    """
      |select count(*) as total
      |from books
      |""".stripMargin

  private val seedSql: String =
    """
      |insert into books (id, title, author, isbn, category, stock_total, stock_available, summary, created_at, updated_at)
      |values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      |on conflict (isbn) do nothing
      |""".stripMargin

  def initialize(connection: Connection): IO[Unit] =
    IO.blocking {
      val statement = connection.createStatement()
      try statement.execute(initTableSql)
      finally statement.close()
    }

  def seedSamples(connection: Connection): IO[Unit] =
    count(connection).flatMap { total =>
      if total > 0 then IO.unit
      else
        val samples = List(
          ("活着", "余华", "9787506365437", "literature", 3, "普通人的生命韧性在时代变迁中展开。"),
          ("三体", "刘慈欣", "9787536692930", "scifi", 2, "文明冲突与宇宙社会学交织展开的科幻长篇。"),
          ("人类简史", "尤瓦尔·赫拉利", "9787508647357", "history", 4, "从认知革命、农业革命到科技革命的人类发展叙事。")
        )
        samples.traverse_ { case (title, author, isbn, category, stock, summary) =>
          insertSeed(connection, title, author, isbn, category, stock, summary)
        }
    }

  private def count(connection: Connection): IO[Long] =
    IO.blocking {
      val statement = connection.createStatement()
      try
        val resultSet = statement.executeQuery(countSql)
        try
          if resultSet.next() then resultSet.getLong("total")
          else 0L
        finally resultSet.close()
      finally statement.close()
    }

  private def insertSeed(
    connection: Connection,
    title: String,
    author: String,
    isbn: String,
    category: String,
    stock: Int,
    summary: String
  ): IO[Unit] =
    IO.blocking {
      val statement = connection.prepareStatement(seedSql)
      try
        val now = Instant.now()
        statement.setObject(1, UUID.randomUUID())
        statement.setString(2, title)
        statement.setString(3, author)
        statement.setString(4, isbn)
        statement.setString(5, category)
        statement.setInt(6, stock)
        statement.setInt(7, stock)
        statement.setString(8, summary)
        statement.setTimestamp(9, Timestamp.from(now))
        statement.setTimestamp(10, Timestamp.from(now))
        statement.executeUpdate()
        ()
      finally statement.close()
    }
