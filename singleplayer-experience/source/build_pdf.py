from pathlib import Path
from xml.sax.saxutils import escape
import json
import math

from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parents[3]
PROJECT = ROOT / 'nailong' / 'singleplayer-experience'
ASSETS = PROJECT / 'assets'
OUTPUT = ROOT / 'output' / 'pdf' / '奶龙小靶场_单人版本设想.pdf'
W, H = 1152, 720
BG = HexColor('#FAF8EF')
INK = HexColor('#173F3B')
TEAL = HexColor('#16756C')
MUTED = HexColor('#657870')
LINE = HexColor('#D9E0D1')
GOLD = HexColor('#E7AD3E')
WHITE = HexColor('#FFFFFF')
PALE = HexColor('#EDF2E5')
DARK = HexColor('#104E4D')
ORANGE = HexColor('#BC651E')

pdfmetrics.registerFont(TTFont('Yahei', 'C:/Windows/Fonts/msyh.ttc', subfontIndex=0))
pdfmetrics.registerFont(TTFont('YaheiBold', 'C:/Windows/Fonts/msyhbd.ttc', subfontIndex=0))
pdfmetrics.registerFont(TTFont('Mono', 'C:/Windows/Fonts/consola.ttf'))

PAGES = [
    dict(phase='第一眼', title='先看见奶龙，再决定开始',
         subtitle='奶龙小靶场 · 30 秒，你能打中几个？', visual='home',
         caption='主菜单沿用左侧花园画面、右侧入口的布局；首页静态图就能成立。',
         lead='“好可爱，先打一局试试。”',
         blocks=[
             ('先把游戏放到眼前', '左边是奶龙、泡泡枪和靶子，右边只有标题、开始挑战、我的成绩与设置。首次打开先看见主菜单。'),
             ('账号入口轻一点', '右上角放“登录 / 注册”。登录后改为昵称与退出入口；未登录点击开始挑战或我的成绩时，再打开账号弹窗。'),
             ('这一版只做单人', '没有房间列表和好友组队按钮。首页可用静态图占位。角色待机动画不作为首版前提。'),
         ],
         strip='一片花园 · 一把泡泡枪 · 一局 30 秒',
         note='设计范围：注册登录、单人打靶、账号成绩与基本设置。图中按钮与文字是交互设想。'),
    dict(phase='账号融入体验', title='登录之后，接着刚才那一步',
         subtitle='需要账号时才出现表单；不把“想玩一下”变成重新寻找入口。', visual='auth',
         caption='点击开始挑战后出现登录 / 注册弹窗；底下仍能看见原来的游戏菜单。',
         lead='“我登录好，就直接进靶场。”',
         blocks=[
             ('第一次来，也能接着玩', '没有账号就切到注册，填写账号、密码和确认密码。注册成功即登录，接着原来的操作继续。'),
             ('记住我原本要做什么', '开始挑战之后去靶场准备，我的成绩之后去成绩页。右上角主动登录后留在主菜单；已经登录就直接进入对应页面。'),
             ('出错时，别让我重走一遍', '账号冲突、密码错误或请求失败，都在弹窗内说明；保留账号输入。关闭弹窗回主菜单，不会暗中开始计时。'),
         ],
         strip='主菜单 → 需要时登录 → 接续原操作',
         note='账号名称作为首版默认昵称。登录成功后仍有准备步骤，不会在表单刚关闭时突然开始 30 秒。'),
    dict(phase='进场与准备', title='先试两枪，再按下开始',
         subtitle='同一片场地先熟悉操作，准备好了再开启正式计时。', visual='ready',
         caption='小人物、远距跟随镜头；虚线示意中央稳定区，实际游玩时默认不显示。',
         lead='“先看看鼠标怎么带动镜头。”',
         blocks=[
             ('走动和瞄准分开', 'W / S 沿镜头的地面方向前后移动，A / D 横移。鼠标指向场景中的瞄准点，左键射击；无需切换视角。'),
             ('中央稳，外围缓缓转', '中央区域只瞄准，外围同时瞄准和带动镜头。越往外转得越快，但有上限；鼠标离开画布或进入菜单时停止。'),
             ('正式开始前，归到同一起点', '准备阶段可试射，不记成绩。点击开始 30 秒后，重置位置、镜头、靶序和弹丸；3、2、1 结束才开始计时与操作。'),
         ],
         strip='W A S D 移动     左键射击     Esc 设置 / 暂停',
         note='资源加载好才可开局。准备倒数期间冻结操作；开始后需重新按下才射击，新的画布鼠标移动才恢复外围转向。'),
    dict(phase='打中第一面靶', title='啪，一圈水花，记下一靶',
         subtitle='枪口、弹道、命中和成绩要连成一件能看懂的事情。', visual='hit',
         caption='蓝色泡泡从枪口飞出；靶面短促晃动、溅出小水花，数字随有效命中增加。',
         lead='“这一下，是我瞄准打中的。”',
         blocks=[
             ('泡泡枪先保持一种手感', '左键单发，按住连射，射速上限先试每秒 4 发。弹丸飞得较快但看得见；无限备弹、不换弹，没有其他武器。'),
             ('一发只算一次命中', '击中一面有效靶记 1 靶，弹丸随即消失，靶也立即失效。动画可以继续，但后续弹丸不能给它重复加分。'),
             ('反馈清楚，瞄准不被抢走', '命中有清脆声音、小水花与短暂 +1；打空没有命中声。枪身轻轻后坐，不强行推走准星，也不自动吸附靶心。'),
         ],
         strip='1 次有效命中 = 1 靶     整个靶面同分',
         note='鼠标命中靶面时瞄准该位置，否则指向地面或远处；泡泡从枪口出发，遇墙即止。中央区域不限制射击方向。'),
    dict(phase='寻找下一面靶', title='近处、左边，还是远处那一面？',
         subtitle='用少量固定靶位制造视线转移，先把“接着打谁”变得有趣。', visual='targets',
         caption='开局 1、3、5 号位有靶，其他位置空着。编号只用于这页讲解。',
         lead='“先打近的，再把视线带到右边。”',
         blocks=[
             ('场地先保持开阔', '六个固定靶位，开局三面活靶，最多同时三面。靶不移动、不还击；摆在不同距离和左右方向，避免互相完全遮挡。'),
             ('击中后，另一个位置接上', '命中后预留另一个空位，按固定顺序轮转。\n约 0.5 秒后补靶，最后 0.3 秒亮圈提示。\n圆靶出现才可计分。'),
             ('留一点选择，不强迫跑图', '可以原地转向连续射击，也可以横移改善角度。预告不是目标；连续命中时可能短暂无靶，等待长度需要试玩检查。'),
         ],
         strip='固定轮转，熟悉路线     靶出现后才生效',
         note='提示圈不挡弹；预留位置不会被重复分配。首版只用一种静止圆靶，不设置靶心奖励、连击倍率或随机特殊靶。'),
    dict(phase='最后几秒', title='还有五秒，我再找最后一面',
         subtitle='紧张感来自清楚的时间，不靠突然闪屏或不停催促。', visual='finish',
         caption='最后 5 秒时间变为暖橙色；到 0 秒，结果明确停止增长。',
         lead='“差一靶就超过刚才了。”',
         blocks=[
             ('越接近结束，信息越简单', '画面一直显示剩余时间和命中靶数。最后 5 秒温和变色、短声提示；不遮准星，不改变射速，也不提高倍率。'),
             ('结束看命中时间', '只有在第 30.000 秒之前发生的有效命中才算。时间到就停火、停止补靶并清除飞行弹丸，不等待最后一发。'),
             ('每一轮都能得到完整结果', '时间结束就是完成，没有强制及格线。0 靶也有结果；中途选择放弃或重新开始，则不记为一次完成成绩。'),
         ],
         strip='29.9 秒命中：计入     30.0 秒及之后：不计入',
         note='命中时间由本轮实际游戏进程记录，不能靠 HUD 显示的四舍五入数字判断；暂停时间不算进 30 秒。'),
    dict(phase='一局结束', title='18 靶，再来一局试试',
         subtitle='成绩先讲清楚发生了什么，再给我一个顺手的下一步。', visual='result',
         caption='示意成绩：18 靶、发射 28 发、命中率 64.3%。这些数字不是实际测试结果。',
         lead='“刚才有几发打急了。”',
         blocks=[
             ('一个主成绩，两项解释', '主成绩是命中靶数；辅助显示发射数和命中率。命中率 = 有效命中弹丸数 / 发射数，最后未命中的弹丸也在分母中。'),
             ('登录账号留下这次练习', '结束即展示结果并保存到账号，区分保存中、已保存和失败。失败结果本机暂存，继续下一局也保留；重试不重复记分。'),
             ('主按钮仍然是玩', '再来一局沿用当前设置，回到相同起点并重新倒数 3 秒。也能查看我的成绩或回主菜单，不在中间插入奖励弹窗。'),
         ],
         strip='主要看命中数     命中率帮助理解，而不改变得分',
         note='未开枪时命中率显示“--”。待保存结果属于开局账号；登录过期后重新登录该账号重试，切换账号不会改记成绩。'),
    dict(phase='回看自己的进步', title='我的成绩，是一段练习记录',
         subtitle='从菜单随时回来，看自己有没有比上一次更顺手。', visual='history',
         caption='示意列表仅展示自己的单人挑战记录；这里不使用在线排名或 rating。',
         lead='“12、15、18，我越来越熟了。”',
         blocks=[
             ('先看最有用的几项', '显示同规则版本的个人最好，以及最近完成记录的时间、命中靶数、发射数和命中率。点一条即可查看该局详情。'),
             ('没有成绩，也有下一步', '新账号显示还没有完成记录，并提供开始挑战。加载中和加载失败单独说明，失败时可以重试，不把失败显示成零分。'),
             ('比较的条件要一致', '靶位、射速或计分规则改变后，用新的规则版本记录。历史成绩保留，不同版本不混算个人最好。'),
         ],
         strip='主菜单 → 我的成绩 → 详情 / 再次挑战',
         note='首版不做排行榜、评级或完整回放。账号关联成绩需要保存接口，但不需要多人房间或实时联机。'),
    dict(phase='舒服地继续玩', title='单人模式，暂停就真的停下来',
         subtitle='设置服务于手感；离开窗口时，不悄悄消耗这轮时间。', visual='settings',
         caption='场内 Esc 打开暂停设置；主菜单也能设置，但无需暂停任何对局。',
         lead='“转得有点快，我先调慢一点。”',
         blocks=[
             ('三个设置就够用', '画质先分低、中、高；总音量可调；外围转向速度可调。低画质减少装饰和阴影，靶、弹丸和命中信息仍要清楚。'),
             ('暂停所有正在发生的事', 'Esc、窗口失焦或切换标签页时，暂停计时、角色、靶刷新与弹丸；清空按键和长按射击。回到页面不会自动恢复。'),
             ('主动继续，再给我三秒', '点继续后倒数 3 秒，期间保持冻结。\n结束后重新按下才射击。新的画布内鼠标移动发生后，才恢复外围转向。'),
         ],
         strip='暂停保留本局     继续有准备     设置记在本机',
         note='画质、音量、镜头速度保存在本机。菜单点击不触发射击或转向；暂停不会退出登录，设置在下次打开时保留。'),
    dict(phase='把首版收住', title='先做成这半分钟，再试那一跳',
         subtitle='下面这张是后续愿望，不是当前版本的验收前提。', visual='future',
         caption='候选：从低平台跃下，向下层圆靶开火。先保留这份期待，再验证是否更好玩。',
         lead='先验证“我愿不愿意再来一局”。',
         blocks=[
             ('首版必须连成一条线', '主菜单、注册登录、准备、30 秒打靶、结算保存、我的成绩、再来一局与设置。一个角色、一张平地靶场、一把枪、一种靶。'),
             ('待试玩调整的数值', '每秒 4 发、六靶位 / 三活靶、补靶 0.5 秒、靶尺寸与距离、泡泡速度、镜头稳定区和转向上限，都先当初始设想。'),
             ('喜欢以后，一次加一点', '先试低台跳射，或横向移动靶，每次只加一种变化。多武器、技能、烟闪、多人、房间与回放，留待后续单独讨论。'),
         ],
         strip='当前键位：移动 + 左键 + Esc     跳跃键尚未启用',
         note='AI 概念图尚未实现，界面与数值待试玩。首版完成这十页的核心流程即可，可选玩法后续再做。'),
]


def text(value, x, y, size=12, color=INK, bold=False, align='left'):
    c.setFillColor(color)
    c.setFont('YaheiBold' if bold else 'Yahei', size)
    method = {'left': c.drawString, 'center': c.drawCentredString, 'right': c.drawRightString}[align]
    method(x, y, value)


def para(value, x, top, width, size=14.2, leading=22, color=INK, bold=False):
    style = ParagraphStyle('p', fontName='YaheiBold' if bold else 'Yahei', fontSize=size,
                           leading=leading, textColor=color, wordWrap='CJK',
                           splitLongWords=True, allowWidows=0, allowOrphans=0)
    p = Paragraph(escape(value).replace('\n', '<br/>'), style)
    _, ph = p.wrap(width, 1000)
    p.drawOn(c, x, top - ph)
    return top - ph


def rounded(x, y, w, h, fill=WHITE, stroke=None, radius=10):
    c.setFillColor(fill)
    if stroke:
        c.setStrokeColor(stroke)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1 if stroke else 0)


def pill(label, x, y, w, h=28, fill=DARK, color=WHITE, size=12):
    rounded(x, y, w, h, fill, radius=h / 2)
    text(label, x + w / 2, y + (h - size) / 2 + 2, size, color, True, 'center')


def button(label, x, y, w, h=34, primary=True):
    rounded(x, y, w, h, TEAL if primary else PALE, radius=8)
    text(label, x + w / 2, y + (h - 13) / 2 + 2, 13, WHITE if primary else TEAL, True, 'center')


def native_image(filename, x, y, w, h):
    # Native PDF placement; source image pixels are never modified.
    c.drawImage(ImageReader(str(ASSETS / filename)), x, y, width=w, height=h,
                preserveAspectRatio=True, anchor='c', mask='auto')


def veil(x, y, w, h, alpha=.28):
    c.saveState()
    c.setFillColor(DARK)
    c.setFillAlpha(alpha)
    c.rect(x, y, w, h, fill=1, stroke=0)
    c.restoreState()


def hud(x, y, w, h, seconds='30.0', hits='00', mode='30 秒挑战', warn=False):
    pill(mode, x + 14, y + h - 42, 100, size=11)
    pill(seconds, x + w / 2 - 39, y + h - 47, 78, 34, ORANGE if warn else DARK, size=20)
    pill('命中 ' + hits, x + w - 112, y + h - 42, 98, size=13)
    pill('W A S D 移动   左键射击   Esc 暂停', x + w / 2 - 156, y + 12, 312, 25, size=10)


def crosshair(x, y):
    c.saveState()
    c.setLineWidth(1.4)
    c.setStrokeColor(WHITE)
    c.circle(x, y, 6, stroke=1, fill=0)
    c.line(x - 9, y, x - 4, y)
    c.line(x + 4, y, x + 9, y)
    c.line(x, y - 9, x, y - 4)
    c.line(x, y + 4, x, y + 9)
    c.restoreState()


def label_box(label, x, y, width, fill=BG):
    rounded(x, y, width, 24, fill, radius=7)
    text(label, x + width / 2, y + 7, 10.5, INK, True, 'center')


def draw_visual(kind, x, y, w, h):
    c.saveState()
    clip = c.beginPath()
    clip.roundRect(x, y, w, h, 12)
    c.clipPath(clip, stroke=0, fill=0)
    if kind in ('home', 'auth'):
        native_image('04-main-menu.png', x, y, w, h)
    elif kind == 'future':
        native_image('03-future-jump.png', x, y, w, h)
    elif kind == 'hit':
        native_image('02-hit-feedback.png', x, y, w, h)
    else:
        native_image('01-garden-range.png', x, y, w, h)

    if kind == 'auth':
        veil(x, y, w, h, .37)
        mw, mh = 302, 324
        mx, my = x + (w - mw) / 2, y + (h - mh) / 2
        rounded(mx, my, mw, mh, BG, radius=14)
        text('登录后，继续开始挑战', mx + 24, my + mh - 35, 16, bold=True)
        text('×', mx + mw - 21, my + mh - 27, 17, MUTED)
        pill('登录', mx + 24, my + 242, 76, fill=TEAL)
        text('注册', mx + 125, my + 250, 12, MUTED)
        text('账号', mx + 24, my + 220, 11, MUTED)
        rounded(mx + 24, my + 177, 254, 32, WHITE, LINE, 6)
        text('奶糖', mx + 36, my + 188, 12)
        text('密码', mx + 24, my + 157, 11, MUTED)
        rounded(mx + 24, my + 114, 254, 32, WHITE, LINE, 6)
        text('● ● ● ● ● ● ● ●', mx + 36, my + 126, 9, MUTED)
        button('登录并继续', mx + 24, my + 62, 254, 36)
        text('没有账号？切换到注册', mx + mw / 2, my + 36, 10.5, MUTED, align='center')
        label_box('注册页另有“确认密码”字段', x + 16, y + 16, 205)
    elif kind == 'ready':
        pill('挑战准备', x + 14, y + h - 42, 95, size=11)
        pill('奶糖', x + w - 83, y + h - 42, 69, size=11)
        c.saveState()
        c.setStrokeColor(WHITE)
        c.setDash(5, 4)
        c.setLineWidth(1.2)
        c.roundRect(x + w * .25, y + h * .23, w * .50, h * .51, 10, stroke=1, fill=0)
        c.restoreState()
        label_box('中央稳定区 · 示意', x + w * .5 - 68, y + h * .74 + 5, 136)
        crosshair(x + w * .443, y + h * .604)
        button('开始 30 秒', x + w / 2 - 68, y + 44, 136)
        pill('W A S D 移动   左键试射   外围渐进转向', x + w / 2 - 164, y + 11, 328, 25, size=10)
        label_box('点击后：3 → 2 → 1 → 开始', x + 15, y + h - 79, 208)
    elif kind == 'hit':
        hud(x, y, w, h, '29.4', '01')
        crosshair(x + w * .444, y + h * .605)
        pill('+1', x + w * .447, y + h * .685, 42, 29, TEAL, size=17)
    elif kind == 'targets':
        pill('六个位置 · 一种圆靶', x + 15, y + h - 43, 170, size=11)
        anchors = [(.242, .50), (.337, .56), (.444, .58), (.559, .57), (.672, .57), (.78, .50)]
        for idx, (ax, ay) in enumerate(anchors, 1):
            px, py = x + w * ax, y + h * ay
            pill(str(idx), px - 12, py + 18, 24, 24, TEAL if idx % 2 else MUTED, size=12)
        label_box('亮圈预告 ≠ 可计分圆靶', x + w / 2 - 95, y + 20, 190)
    elif kind == 'finish':
        hud(x, y, w, h, '00.0', '18', warn=True)
        veil(x, y, w, h, .12)
        rounded(x + w / 2 - 138, y + h / 2 - 46, 276, 106, BG, radius=13)
        text('时间到！', x + w / 2, y + h / 2 + 22, 24, INK, True, 'center')
        text('本轮命中 18 靶', x + w / 2, y + h / 2 - 8, 16, TEAL, True, 'center')
        text('飞行中的泡泡不再补算', x + w / 2, y + h / 2 - 31, 11, MUTED, align='center')
        pill('最后 5 秒变色提醒', x + 15, y + 47, 149, 26, ORANGE, size=10)
    elif kind == 'result':
        veil(x, y, w, h, .37)
        mw, mh = 354, 348
        mx, my = x + (w - mw) / 2, y + (h - mh) / 2
        rounded(mx, my, mw, mh, BG, radius=14)
        text('挑战完成', mx + mw / 2, my + mh - 35, 18, bold=True, align='center')
        pill('已保存', mx + mw - 81, my + mh - 34, 63, 21, fill=PALE, color=TEAL, size=9)
        text('18', mx + mw / 2 - 10, my + 227, 54, TEAL, True, 'center')
        text('靶', mx + mw / 2 + 35, my + 233, 18, TEAL, True)
        text('新纪录 · 此前最好 15 靶', mx + mw / 2, my + 203, 11, ORANGE, True, 'center')
        c.setStrokeColor(LINE)
        c.line(mx + 28, my + 185, mx + mw - 28, my + 185)
        text('发射', mx + 92, my + 160, 11, MUTED, align='center')
        text('命中率', mx + 260, my + 160, 11, MUTED, align='center')
        text('28 发', mx + 92, my + 134, 20, bold=True, align='center')
        text('64.3%', mx + 260, my + 134, 20, bold=True, align='center')
        button('再来一局', mx + 28, my + 76, 298, 37)
        button('我的成绩', mx + 28, my + 29, 142, 32, False)
        button('回主菜单', mx + 184, my + 29, 142, 32, False)
    elif kind == 'history':
        veil(x, y, w, h, .18)
        mx, my, mw, mh = x + 22, y + 26, w - 44, h - 52
        rounded(mx, my, mw, mh, BG, radius=13)
        text('我的成绩', mx + 24, my + mh - 34, 21, bold=True)
        text('奶糖', mx + mw - 24, my + mh - 30, 11, MUTED, align='right')
        rounded(mx + 24, my + mh - 117, mw - 48, 62, PALE, radius=8)
        text('当前规则 · 个人最好', mx + 39, my + mh - 80, 11, MUTED)
        text('18 靶', mx + mw - 41, my + mh - 99, 29, TEAL, True, 'right')
        cols = [mx + 39, mx + 215, mx + 335, mx + 473]
        for txt, px in zip(['完成时间', '命中', '发射', '命中率'], cols):
            text(txt, px, my + 214, 10.5, MUTED)
        rows = [('刚刚', '18 靶', '28 发', '64.3%'), ('上一局', '15 靶', '27 发', '55.6%'), ('更早一局', '12 靶', '25 发', '48.0%')]
        for ri, row in enumerate(rows):
            yy = my + 182 - ri * 39
            if ri == 0:
                rounded(mx + 24, yy - 11, mw - 48, 34, HexColor('#F2E8CC'), radius=6)
            for txt, px in zip(row, cols):
                text(txt, px, yy, 12, INK, ri == 0)
        button('开始挑战', mx + mw - 164, my + 20, 140, 34)
        text('返回主菜单', mx + 24, my + 31, 11, TEAL, True)
    elif kind == 'settings':
        veil(x, y, w, h, .4)
        mw, mh = 348, 337
        mx, my = x + (w - mw) / 2, y + (h - mh) / 2
        rounded(mx, my, mw, mh, BG, radius=14)
        text('已暂停', mx + 25, my + mh - 35, 22, bold=True)
        text('剩余 18.6 秒', mx + mw - 25, my + mh - 30, 11, MUTED, align='right')
        text('画质', mx + 25, my + 268, 12, bold=True)
        for idx, lab in enumerate(['低', '中', '高']):
            pill(lab, mx + 97 + idx * 73, my + 255, 60, 27, TEAL if idx == 1 else PALE,
                 WHITE if idx == 1 else TEAL, size=11)
        for label, val, yy in [('总音量', .6, 214), ('转向速度', .4, 156)]:
            text(label, mx + 25, my + yy + 9, 12, bold=True)
            text(str(int(val * 100)) + '%', mx + mw - 25, my + yy + 9, 11, MUTED, align='right')
            rounded(mx + 25, my + yy - 11, 298, 6, LINE, radius=3)
            rounded(mx + 25, my + yy - 11, 298 * val, 6, TEAL, radius=3)
            c.setFillColor(TEAL)
            c.circle(mx + 25 + 298 * val, my + yy - 8, 6, fill=1, stroke=0)
        button('继续 · 准备 3 秒', mx + 25, my + 56, 298, 38)
        text('放弃本局，回主菜单', mx + mw / 2, my + 27, 11, MUTED, align='center')
    elif kind == 'future':
        pill('后续候选 · 首版不要求', x + 15, y + h - 44, 194, 29, ORANGE, size=11)
        label_box('低平台跳射', x + 18, y + 20, 114)
    c.restoreState()


OUTPUT.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(OUTPUT), pagesize=(W, H), pageCompression=1)
c.setTitle('奶龙小靶场｜单人版本设想')
c.setAuthor('游戏体验设计草案')
c.setSubject('注册登录融入主菜单；30秒单人打靶、成绩、再来一局与首版范围')
audits = []

for idx, page in enumerate(PAGES, 1):
    c.setFillColor(BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    pill(f'{idx:02}', 40, 670, 33, 23, TEAL, size=10)
    text(page['phase'], 84, 676, 11, TEAL, True)
    text('单人体验设想  /  2026.10.31', W - 40, 677, 10, MUTED, align='right')
    text(page['title'], 40, 625, 29, INK, True)
    text(page['subtitle'], 40, 594, 13.2, MUTED)
    c.setStrokeColor(LINE)
    c.line(40, 578, W - 40, 578)

    draw_visual(page['visual'], 40, 143, 664, 415)
    cap_bottom = para(page['caption'], 43, 130, 656, 11.5, 18, MUTED)
    rounded(40, 57, 664, 38, PALE, radius=9)
    text(page['strip'], 372, 71, 12, TEAL, True, 'center')

    tx, tw, top = 742, 370, 555
    top = para(page['lead'], tx, top, tw, 18, 27, INK, True) - 20
    for title, body in page['blocks']:
        top = para(title, tx, top, tw, 14.8, 23, TEAL, True) - 5
        top = para(body, tx, top, tw, 14.0, 22, INK) - 18
    note_top = top + 1
    c.setStrokeColor(LINE)
    c.line(tx, note_top, tx + tw, note_top)
    note_bottom = para(page['note'], tx, note_top - 12, tw, 10.8, 17, MUTED)

    c.setStrokeColor(LINE)
    c.line(40, 40, W - 40, 40)
    text('奶龙小靶场  /  概念画面与示意数据，尚未实现', 40, 23, 9, MUTED)
    text(f'{idx:02} / {len(PAGES):02}', W - 40, 23, 10, MUTED, align='right')
    audits.append(dict(page=idx, title=page['title'], caption_bottom=round(cap_bottom, 2),
                       note_bottom=round(note_bottom, 2)))
    if note_bottom < 54 or cap_bottom < 97:
        raise ValueError(f'Layout overflow: {audits[-1]}')
    c.showPage()

c.save()
(PROJECT / 'source' / 'story.json').write_text(json.dumps(PAGES, ensure_ascii=False, indent=2), encoding='utf-8')
(PROJECT / 'source' / 'layout-audit.json').write_text(json.dumps(audits, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(output=str(OUTPUT), pages=len(PAGES), bytes=OUTPUT.stat().st_size,
                     min_note_bottom=min(x['note_bottom'] for x in audits)), ensure_ascii=False))
