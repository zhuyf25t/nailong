package soda.parkour

enum Script:
  case None, GlitchWarm, RushCold, MovingBars, PhaseAlternating

final case class SignDef(cell: Cell, pages: Vector[String], removed: Boolean = false, finalSign: Boolean = false)

final case class CheckpointDef(cell: Cell, removed: Boolean = false)

final case class MovingDef(x: Double, y: Double, w: Double, h: Double,
                           minY: Double, maxY: Double, step: Double, every: Int)

final case class RoomDef(level: Int, phase: Phase,
                         walls: Set[Cell], hazards: Set[Cell],
                         signs: Vector[SignDef], checkpoints: Vector[CheckpointDef],
                         mushroom: Option[Cell],
                         spawn: Cell, exit: Cell,
                         creep: Boolean, behindHazard: Boolean,
                         moving: Vector[MovingDef], script: Script)

object ParkourLevels:
  private val Columns = ParkourGeometry.Columns
  private val Rows = ParkourGeometry.Rows

  private def r(inner: String): String =
    val body = if inner.length >= Columns - 2 then inner.take(Columns - 2)
    else inner + "." * (Columns - 2 - inner.length)
    "#" + body + "#"

  private def frame(inner: Vector[String]): Vector[String] =
    val border = "#" * Columns
    val body = if inner.length >= Rows - 2 then inner.take(Rows - 2)
    else inner ++ Vector.fill(Rows - 2 - inner.length)("." * (Columns - 2))
    (border +: body.map(r) :+ border)

  private val levelOne = frame(Vector(
    "............................",
    "............................",
    "....##..........##..........",
    "............................",
    "............................",
    ".........##..........##.....",
    "............................",
    "............................",
    "............................",
    "....##..........##..........",
    "............................",
    "............................",
    ".........##..........##.....",
    "............................",
    "............................",
    "............................"
  ))

  private val levelTwo = frame(Vector(
    "............................",
    "..####...####...####...###..",
    "............................",
    "..####...####...####...###..",
    "............................",
    "..####...####...####...###..",
    "............................",
    "....#..................#....",
    "....#..................#....",
    "....#..................#....",
    "............................",
    "..###...####...####...####..",
    "............................",
    "..###...####...####...####..",
    "............................",
    "............................"
  ))

  private val levelThree = frame(Vector(
    "............................",
    "..####....~~~~....####......",
    "..........~~~~..............",
    "..####....~~~~....####......",
    "............................",
    "......~~~~~~....~~~~~~......",
    "............................",
    "..####....~~~~....####......",
    "..........~~~~..............",
    "..####....~~~~....####......",
    "............................",
    "......~~~~~~....~~~~~~......",
    "............................",
    "..####....~~~~....####......",
    "............................",
    "............................"
  ))

  private val levelFour = frame(Vector(
    "............................",
    "....~~~~~~....~~~~~~........",
    "....~~~~~~....~~~~~~........",
    "............................",
    "........~~~~~~....~~~~~~....",
    "........~~~~~~....~~~~~~....",
    "............................",
    "....~~~~~~..................",
    "....~~~~~~..................",
    "............................",
    "........~~~~~~....~~~~~~....",
    "........~~~~~~....~~~~~~....",
    "............................",
    "....~~~~~~....~~~~~~........",
    "............................",
    "............................"
  ))

  private val levelFive = frame(Vector(
    "............................",
    "............................",
    "..####.........####.........",
    "............................",
    "............................",
    "........####........####....",
    "............................",
    "............................",
    "............................",
    "........####........####....",
    "............................",
    "............................",
    "..####.........####.........",
    "............................",
    "............................",
    "............................"
  ))

  private val levelSix = frame(Vector.fill(16)("...........###.....~~......."))

  private val levelFourWarm = frame(Vector(
    "............................",
    "....~~~~~~....~~~~~~........",
    "....~~~~~~....~~~~~~........",
    "............................",
    "........~~~~~~....~~~~~~....",
    "........~~~~~~....~~~~~~....",
    "............................",
    "....~~~~~~..............~~~.",
    "....~~~~~~..................",
    "........................~~~.",
    "........~~~~~~....~~~~~~....",
    "........~~~~~~....~~~~~~....",
    "............................",
    "....~~~~~~....~~~~~~........",
    "............................",
    "............................"
  ))

  private def line(from: Cell, to: Cell): Vector[Cell] =
    if from.col == to.col then
      val step = if to.row >= from.row then 1 else -1
      (from.row to to.row by step).map(row => Cell(from.col, row)).toVector
    else if from.row == to.row then
      val step = if to.col >= from.col then 1 else -1
      (from.col to to.col by step).map(col => Cell(col, from.row)).toVector
    else Vector(from, to)

  private def maze(path: Vector[Cell]): Vector[String] =
    val safe = path.toSet
    val rows = (1 to Rows - 2).map { row =>
      (1 to Columns - 2).map { col =>
        if safe.contains(Cell(col, row)) then '.' else '~'
      }.mkString
    }.toVector
    frame(rows)

  private val levelTwoCold = maze(
    line(Cell(27, 9), Cell(26, 9)) ++ line(Cell(26, 9), Cell(24, 9)) ++
      line(Cell(24, 9), Cell(24, 4)) ++ line(Cell(24, 4), Cell(18, 4)) ++
      line(Cell(18, 4), Cell(18, 12)) ++ line(Cell(18, 12), Cell(14, 12)) ++
      line(Cell(14, 12), Cell(14, 7)) ++ line(Cell(14, 7), Cell(10, 7)) ++
      line(Cell(10, 7), Cell(10, 9)) ++ Vector(Cell(6, 9)) ++
      line(Cell(6, 9), Cell(4, 9)) ++ line(Cell(4, 9), Cell(2, 9))
  )

  private val levelThreeCold = maze(
    line(Cell(27, 9), Cell(25, 9)) ++ line(Cell(25, 9), Cell(24, 9)) ++
      line(Cell(24, 9), Cell(24, 14)) ++ line(Cell(24, 14), Cell(16, 14)) ++
      line(Cell(16, 14), Cell(16, 7)) ++ line(Cell(16, 7), Cell(12, 7)) ++
      line(Cell(12, 7), Cell(12, 10)) ++ line(Cell(12, 10), Cell(10, 10)) ++
      Vector(Cell(6, 10)) ++ line(Cell(6, 10), Cell(6, 9)) ++
      line(Cell(6, 9), Cell(4, 9)) ++ line(Cell(4, 9), Cell(2, 9))
  )

  private val levelFourCold = maze(
    line(Cell(27, 9), Cell(26, 9)) ++ line(Cell(26, 9), Cell(23, 9)) ++
      line(Cell(23, 9), Cell(23, 13)) ++ line(Cell(23, 13), Cell(18, 13)) ++
      line(Cell(18, 13), Cell(18, 8)) ++ line(Cell(18, 8), Cell(15, 8)) ++
      line(Cell(15, 8), Cell(15, 9)) ++ Vector(Cell(11, 9)) ++
      line(Cell(11, 9), Cell(9, 9)) ++ line(Cell(9, 9), Cell(9, 6)) ++
      line(Cell(9, 6), Cell(6, 6)) ++ line(Cell(6, 6), Cell(6, 9)) ++
      line(Cell(6, 9), Cell(4, 9)) ++ line(Cell(4, 9), Cell(2, 9))
  )

  private val levelSeven = frame(Vector(
    "............................",
    "............................",
    "....####........####........",
    "............................",
    "............................",
    "........####........####....",
    "............................",
    "............................",
    "............................",
    "........####........####....",
    "............................",
    "............................",
    "....####........####........",
    "............................",
    "............................",
    "............................"
  ))

  private def tiles(rows: Vector[String]): (Set[Cell], Set[Cell]) =
    var walls = Set.empty[Cell]
    var hazards = Set.empty[Cell]
    for
      row <- rows.indices
      col <- rows(row).indices
    do
      val cell = Cell(col, row)
      if !cell.border then
        rows(row)(col) match
          case '#' => walls += cell
          case '~' => hazards += cell
          case _ => ()
    (walls, hazards)

  private def room(level: Int, phase: Phase, rows: Vector[String]): RoomDef =
    val (walls, hazards) = tiles(rows)
    val cold = phase == Phase.Cold
    val spawn = if cold then Cell(27, 9) else Cell(2, 9)
    val exit = if cold then Cell(2, 9) else Cell(27, 9)
    val empty = RoomDef(level, phase, walls, hazards, Vector.empty, Vector.empty, None, spawn, exit,
      creep = false, behindHazard = false, Vector.empty, Script.None)

    level match
      case 1 =>
        if cold then empty.copy(
          signs = Vector(SignDef(Cell(2, 8), Vector("RUUUUUSH!!!!!!!"), finalSign = true)),
          script = Script.PhaseAlternating, behindHazard = true
        )
        else empty.copy(
          signs = Vector(
            SignDef(Cell(5, 9), Vector("*阅*读*告*示*牌*的*时*候*是*无*敌*的*。*按 C 结束。")),
            SignDef(Cell(10, 7), Vector("即使你不按 C，告示牌也会自动阅读完毕，这个是防呆设计。",
              "告示牌可以显示多个字")),
            SignDef(Cell(14, 11), Vector("你这次好像是来采集什么蘑菇的。大概只要进去拿到蘑菇出来就可以了。",
              "至于为什么拿蘑菇你有点忘记了，大抵有点失忆了（bushi，可能是你患有不连续记忆症病史。"))
          ),
          checkpoints = Vector(CheckpointDef(Cell(2, 9)))
        )
      case 2 =>
        if cold then empty.copy(
          signs = Vector(
            SignDef(Cell(25, 8), Vector("你已经没有退路了。"), removed = true),
            SignDef(Cell(24, 9), Vector("别读了，它已经坏了。"), removed = true)
          ),
          checkpoints = Vector(CheckpointDef(Cell(26, 9))),
          creep = true
        )
        else empty.copy(signs = Vector(SignDef(Cell(3, 9), Vector("这些墙你过不去。"))))
      case 3 =>
        if cold then empty.copy(
          signs = Vector(SignDef(Cell(25, 8), Vector("这里曾经有一个检查点。"), removed = true)),
          checkpoints = Vector(CheckpointDef(Cell(24, 9), removed = true)),
          creep = true
        )
        else empty.copy(signs = Vector(SignDef(Cell(4, 9), Vector("不要碰奇怪的东西，会让你变得不幸。"))))
      case 4 =>
        if cold then empty.copy(
          signs = Vector(SignDef(Cell(25, 8), Vector("跑。"), removed = true)),
          checkpoints = Vector(CheckpointDef(Cell(26, 9))),
          creep = true
        )
        else empty.copy(checkpoints = Vector(CheckpointDef(Cell(26, 9))))
      case 5 =>
        if cold then empty.copy(
          signs = Vector(SignDef(Cell(24, 8), Vector("你很聪明，记忆力也很好。",
            "知道这个设计是有意为之的。", "对吧 :)"))),
          checkpoints = Vector(CheckpointDef(Cell(15, 9), removed = true)),
          script = Script.RushCold
        )
        else empty.copy(
          signs = Vector(SignDef(Cell(13, 8), Vector("你很聪明，记忆力也很好。",
            "知道这个设计是有意为之的。"))),
          script = Script.GlitchWarm
        )
      case 6 =>
        val bars =
          if cold then Vector(
            MovingDef(17 * 16, 3 * 16, 32, 32, 2 * 16, 14 * 16, 16, 40),
            MovingDef(5 * 16, 12 * 16, 32, 32, 2 * 16, 14 * 16, 16, 40)
          ) else Vector.empty
        if cold then empty.copy(
          signs = Vector(SignDef(Cell(25, 8), Vector("有意为之。", "嗯嘟。"))),
          creep = true, moving = bars, script = Script.MovingBars
        )
        else empty.copy(signs = Vector(SignDef(Cell(10, 9), Vector("按下 X 可以使用瞬移，来跳过你走不通的地方。"))))
      case 7 =>
        if cold then empty.copy(
          checkpoints = Vector(CheckpointDef(Cell(25, 9))),
          creep = true
        )
        else empty.copy(mushroom = Some(Cell(25, 9)))
      case _ => empty

  private val compiled: Map[(Int, Phase), RoomDef] = Vector(
    (1, Phase.Warm, levelOne), (2, Phase.Warm, levelTwo), (3, Phase.Warm, levelThree),
    (4, Phase.Warm, levelFourWarm), (5, Phase.Warm, levelFive), (6, Phase.Warm, levelSix),
    (7, Phase.Warm, levelSeven),
    (1, Phase.Cold, levelOne), (2, Phase.Cold, levelTwoCold), (3, Phase.Cold, levelThreeCold),
    (4, Phase.Cold, levelFourCold), (5, Phase.Cold, levelFive), (6, Phase.Cold, levelSix),
    (7, Phase.Cold, levelSeven)
  ).map { case (level, phase, rows) => (level, phase) -> room(level, phase, rows) }.toMap

  def room(level: Int, phase: Phase): RoomDef =
    compiled.getOrElse((level, phase), throw new IllegalArgumentException(s"Unknown room $level $phase"))

  def rooms: Vector[RoomDef] =
    (1 to 7).toVector.flatMap(level => Vector(room(level, Phase.Warm), room(level, Phase.Cold)))
