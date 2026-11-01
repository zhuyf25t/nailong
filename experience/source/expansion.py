"""Jumping and effects: experience pages and two compact design panels."""
from reportlab.lib.colors import HexColor


FROST_ROCKET = dict(
    phase='再试两种手感', title='一阵冷雾，一条慢慢散开的白烟',
    subtitle='冰霜枪与火箭筒作为下一轮扩展，让状态与弹道都能被看懂。',
    image='15-frost-rocket-v2.png',
    caption='冷雾提示减速；火箭尾烟提示过去的飞行路径。两种烟雾承担不同作用。',
    lead='我先看见效果，再决定怎么躲。',
    blocks=[
        ('冰霜枪 · 让对手慢下来', '冰弹命中后，脚边结霜、冒出冷雾，短暂减速。仍可瞄准、跳跃；重复命中刷新时间，不无限叠加。雾气随状态结束而散。'),
        ('火箭筒 · 留下一条轨迹', '火箭向前飞，尾部刚冒出的白烟细而密。旧烟留在经过的空气里，逐渐变宽、变淡；爆炸之后，残烟仍会慢慢消失。'),
        ('看起来强，也要有应对办法', '火箭较慢，发射间隔长。\n对手能横移躲开或借墙挡住爆炸。\n贴身发射也可能伤到自己。\n尾烟只提示轨迹，不提供烟幕遮蔽。'),
    ],
    note='仍然一次只持一把枪，靠近按 E 替换。冰霜减速与爆炸伤害是规则；脚边冷雾与尾烟是规则的视觉反馈。',
)

JUMP = dict(
    phase='跳下去开火', title='从平台跃下，枪口朝向下面',
    subtitle='高度终于成为一个主动选择：我能从上面出手，也必须考虑落在哪里。',
    image='14-jump-attack.png',
    caption='脚离开平台、影子留在下层地面；这一瞬间，我仍能移动鼠标向下瞄准。',
    lead='“他躲在下面，那我跳下去试试！”',
    blocks=[
        ('这一跳怎么发生', '我沿坡道上小平台，按 Space 跃出边缘。下落时把鼠标移向下层的小柠，左键开火；泡泡从上方向下飞过去。'),
        ('手感先保持简单', '空中能小幅修正移动方向，不能二段跳或用 Shift 空中冲刺。低平台落地无摔伤；落地后才能再次跳跃，身体轻轻一弹。'),
        ('镜头帮我看清，而不替我瞄准', '镜头平滑跟随高度，朝向仍由鼠标控制。落点影子帮助判断距离；小柠能横移躲开，我落地时也会暴露在他的枪口下。'),
    ],
    note='Space 跳跃，Shift 地面冲刺。跳跃不自带额外伤害、无敌或踩人攻击；这一版先验证“落点判断 + 空中瞄准”的乐趣。',
)

THROWABLES = dict(
    phase='改变一次交火', title='烟里绕过去，闪光前躲回来',
    subtitle='投掷物提供一次改变视线的机会；房间里二选一，每次出生补一枚。',
    image='16-smoke-flash-v2.png',
    caption='G 朝瞄准方向抛出所带道具，短暂延时后生效；两张画面是不同的使用场景。',
    lead='枪还在手里，但我有了另一条路。',
    blocks=[
        ('烟雾弹 · 把通道遮起来', '烟在落点展开，暂时挡住双方视线。我绕到侧面，子弹仍能穿过烟；烟后不显示敌人描边、姓名或血条。雾散后通道重新清楚。'),
        ('闪光弹 · 给对方一个选择', '引信有短促提示。我可以躲进墙后，或把观看方向转开。生效程度取决于距离、遮挡和观看方向，不是全场统一白屏。'),
        ('表现舒服，信息仍要一致', '柔和闪光用灰雾降低刺眼程度，但保留遮蔽时长。低画质也不能看穿烟。自投的烟和闪光同样影响自己，不能无脑扔脚下。'),
    ],
    note='烟幕是带范围与寿命的玩法区域；闪光按角色头部的遮挡与相机观看方向判定。画面只示意效果，精确范围和时长待试玩。',
)

WEAPON_MODEL = dict(
    phase='把想象接到代码', title='武器是什么，由数据和行为一起描述',
    subtitle='先统一描述方式，保留真正不同的行为；这两页是实现草图，不是微服务规格。',
    panel='weapon-model',
    caption='同一套飞行逻辑可以搭配不同命中效果；冰霜与火箭不必各自复制一整套更新流程。',
    lead='需要判断，但把判断放在明确的地方。',
    blocks=[
        ('配置描述已有能力', 'WeaponDef 存标识与版本、发射方式、命中效果和外观模板引用。减速有比例与时长，爆炸有半径与伤害；用带参数的类型表达。'),
        ('函数执行具体行为', '用 enum / match 选择飞行函数。\n得到命中后，再应用配置中的效果。\n函数式编程允许判断；配色变化可改配置。\n新增追踪机制仍须写代码。[3]'),
        ('联机传数据，渲染消费事件', '服务端按固定步长更新状态、裁定命中与效果。客户端收到事件后播放特效；不跨网络传函数，也不让烟粒子决定谁被击中。'),
    ],
    note='纯函数示意：step(world, input, fixedDt, rng) -> (nextWorld, events, nextRng)。运行状态与配置分开；Mesh 留在渲染层。',
    sources=[('[3] Scala ADT / match', 'https://docs.scala-lang.org/scala3/book/types-adts-gadts.html')],
)

FX_MODEL = dict(
    phase='通用描述特效', title='一条尾烟，靠模板和时间慢慢生长',
    subtitle='以火箭尾烟为例：模板选择如何画，参数描述怎样变化，事件控制何时开始和结束。',
    panel='smoke-lifecycle',
    caption='图中是单个烟粒子的生命周期；连续出生的一串粒子，才构成火箭经过后的尾烟。',
    lead='先写少量模板，再用参数组合。',
    blocks=[
        ('特效描述里有什么', '模板引用、材质、颜色、发射率、寿命、大小与透明度曲线，再加坐标空间和随机种子。枪口闪光跟随枪口；烟粒子出生后留在世界里。'),
        ('事件怎样驱动画面', 'Shot 启动发射器，沿火箭实体更新的位置采样。Impact 停止发射并播放爆点，残烟继续淡出。状态、区域、曝光事件分别控制冰雾、烟幕、闪光。'),
        ('通用有边界', '模板内部仍需更新函数或 shader。可先用 Sprite / Points 表现粒子，限制数量并检查透明排序；低画质能减装饰，不能改变烟幕和闪光的遮蔽。[4][5][6]'),
    ],
    note='事件至少关联 eventId、tick、entityId 和位置；重复到达不重复播放，随机种子控制外观。事件可以留存，完整回放方案另议。',
    sources=[('[4] Three.js Sprite', 'https://threejs.org/docs/pages/Sprite.html'),
             ('[5] 透明效果', 'https://threejs.org/manual/pages/transparency.html'),
             ('[6] Three.js Points', 'https://threejs.org/docs/pages/Points.html')],
)


def expand_pages(pages):
    result = []
    for page in pages:
        result.append(page)
        if page['title'] == '换把枪，就换一种打法':
            result.append(FROST_ROCKET)
        elif page['title'] == '绕路，还是抢那瓶奶？':
            result.extend([JUMP, THROWABLES])
    return result + [WEAPON_MODEL, FX_MODEL]


def draw_panel(c, paragraph, kind):
    ink, teal, muted = map(HexColor, ['#173D39', '#287B70', '#66736B'])
    c.setFillColor(HexColor('#E8EDE1'))
    c.roundRect(40, 161, 684, 427.5, 12, fill=1, stroke=0)

    def card(y, height, title, text):
        c.setFillColor(HexColor('#FFFEF8'))
        c.roundRect(58, y, 648, height, 9, fill=1, stroke=0)
        paragraph(title, 76, y + height - 13, 612, 15, 21, teal, True)
        paragraph(text, 76, y + height - 42, 612, 13.4, 21, ink)

    if kind == 'weapon-model':
        card(458, 113, '① 配置：WeaponDef',
             '冰霜枪：Bolt + Slow + frost.v1\n火箭筒：Bolt + Blast + rocket.v1\n投掷物：抛物线飞行 + 计时触发 SmokeArea / Flash')
        card(355, 91, '② 飞行弹体的状态：ProjectileState',
             'entityId / ownerId / position / velocity / age\n烟幕另有区域形状、范围与持续时间；不是一团粒子的碰撞。')
        c.setFillColor(ink)
        c.roundRect(58, 180, 648, 161, 9, fill=1, stroke=0)
        paragraph('③ 行为函数：按类型分派，再更新状态', 76, 325, 612, 15, 21, HexColor('#EAF2D7'), True)
        lines = [
            'val advance = delivery match',
            '  case Bolt(spec) => stepBolt(spec)',
            '  case Ray(spec)  => stepRay(spec)',
            'val motion = advance(state, input, fixedDt)',
            'applyHits(motion, weapon.onHit)',
        ]
        c.setFont('Mono', 14)
        c.setFillColor(HexColor('#FFFFFF'))
        for i, line in enumerate(lines):
            c.drawString(77, 281 - 19 * i, line)
        paragraph('Scala 风格结构示意；具体类型与签名尚未定稿。', 77, 197, 610, 10.4, 15, HexColor('#C4D3C5'))
    else:
        card(446, 125, 'TrailRecipe：whiteSmoke.v1',
             '模板：SpriteCloud    发射：沿路径按距离采样\n空间：World    材质：柔边烟片    外观随机种子：seed\n寿命：lifetime    大小：size(age)    透明度：alpha(age)')
        c.setFillColor(HexColor('#63919B'))
        c.roundRect(58, 292, 648, 140, 9, fill=1, stroke=0)
        paragraph('同一粒烟：从出生到消失', 76, 418, 612, 14, 20, HexColor('#FFFFFF'), True)
        stages = [(132, 9, .90, '新生 · 细密'), (291, 20, .58, '变宽 · 扩散'),
                  (450, 30, .20, '变淡 · 残留'), (610, 0, 0, '结束 · 回收')]
        for i, (x, radius, alpha, label) in enumerate(stages):
            if radius:
                c.saveState()
                c.setFillColor(HexColor('#FFFFFF'))
                c.setFillAlpha(alpha)
                c.circle(x, 360, radius, fill=1, stroke=0)
                c.restoreState()
            else:
                c.setStrokeColor(HexColor('#D3E3DE'))
                c.setDash(2, 4)
                c.circle(x, 360, 30, fill=0, stroke=1)
                c.setDash()
            c.setFont('Yahei', 11.5)
            c.setFillColor(HexColor('#FFFFFF'))
            c.drawCentredString(x, 305, label)
            if i < 3:
                c.setStrokeColor(HexColor('#D3E3DE'))
                c.line(x + 47, 360, x + 104, 360)
                c.line(x + 99, 364, x + 104, 360)
                c.line(x + 99, 356, x + 104, 360)
        card(180, 98, '事件管生命周期',
             'Shot -> 开始发射烟粒子\nImpact / Despawn -> 停止新粒子；残烟寿命结束再回收')
