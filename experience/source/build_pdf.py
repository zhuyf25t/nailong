from pathlib import Path
from xml.sax.saxutils import escape
import json

from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.utils import ImageReader
from expansion import expand_pages, draw_panel


WORKSPACE = Path(__file__).resolve().parents[3]
PROJECT = WORKSPACE / 'nailong' / 'experience'
ASSETS = PROJECT / 'assets'
OUTPUT = WORKSPACE / 'output' / 'pdf' / '奶龙竞技场_一次试玩想象.pdf'
W, H = 1152, 720
BG = HexColor('#FAF8F0')
INK = HexColor('#173D39')
TEAL = HexColor('#287B70')
MUTED = HexColor('#66736B')
LINE = HexColor('#DADFD1')
GOLD = HexColor('#E4AA34')

pdfmetrics.registerFont(TTFont('Yahei', 'C:/Windows/Fonts/msyh.ttc', subfontIndex=0))
pdfmetrics.registerFont(TTFont('YaheiBold', 'C:/Windows/Fonts/msyhbd.ttc', subfontIndex=0))
pdfmetrics.registerFont(TTFont('Mono', 'C:/Windows/Fonts/consola.ttf'))

PAGES = [
    dict(
        phase='进入', title='先让我玩起来',
        subtitle='一次大约十分钟的试玩想象，从一只小黄龙开始。',
        image='01-arrival.png',
        caption='这扇入口只做一件事：让我愿意按下“先练一会”。',
        lead='我打开网页，先看见它。',
        blocks=[
            ('眼前发生什么', '小黄龙抱着玩具枪，面前就是草地、木箱和靶子。我填个昵称，点“先练一会”，马上进入场地。'),
            ('我会想试什么', '泡泡能打多远？绕到箱子后面会不会被挡住？先让我亲手试，再决定要不要叫朋友。'),
            ('这份图册的范围', '先想象一个小场地里的完整体验。角色、地图与界面沿用同一画风；玩法和数值仍是提案。'),
        ],
        note='画面目标：低面数角色、简单材质、少量树丛与箱子。所有图片都是概念画面，尚不是 Three.js 运行截图。',
    ),
    dict(
        phase='练习', title='人物小一点，场地多一点',
        subtitle='采用你认可的远距跟随视图，把视野留给路线、掩体和对手。',
        image='05-thirdperson-jump-controls.png',
        caption='小龙留在画面下方；鼠标可见，白色小圆环表示瞄准位置。',
        lead='我能看清前面，也能横着躲。',
        blocks=[
            ('手上怎么操作', 'W / S：沿镜头在地面上的朝向前进、后退。\nA / D：沿画面左右方向平移。\n左键射击；右键释放所带技能。\nSpace 跳跃；Shift 地面冲刺。\nE 换枪；G 投掷所带道具。'),
            ('身体朝哪里', '小龙朝瞄准方向，可以侧着跑、倒着退。地面冲刺跟随移动方向；没有移动输入时，沿瞄准方向在地面上的投影冲刺。'),
            ('镜头怎样跟着我', '镜头平滑跟随位置，朝向由鼠标区域控制。先保留这一种游戏视图，不加手动切换视角的按钮。'),
        ],
        note='本轮加入跳跃：Space 用于跳跃，冲刺改为 Shift。鼠标始终自由瞄准，空中也能开火；右键仍只负责技能。',
    ),
    dict(
        phase='试试武器', title='换把枪，就换一种打法',
        subtitle='先试三种能改变交火距离与路线的武器；都沿用玩具枪的外观。',
        image='11-weapons.png',
        caption='练习场可以点卡片直接试射；联机时，武器放在地图里，靠近后按 E 换上。',
        lead='这次贴近一点，下次试试墙角。',
        blocks=[
            ('泡泡枪 · 稳定中距', '开局就有，连续发射直线泡泡。适合边横移边瞄准；弹丸有飞行时间，远处要提前瞄。'),
            ('散射枪 · 近身爆发', '一次打出一小扇弹丸，近处容易命中多颗。\n距离远了弹丸会散开，开火间隔也更长。\n打空后，对手就有反击机会。'),
            ('弹弹枪 · 借墙找角度', '弹丸能在实体墙或箱子上反弹一次，再碰实体就消失。射速较慢；命中人物或护盾就结算消失，不会继续弹。'),
        ],
        note='暂定一次只持一把，按 E 替换时旧枪落地；重生拿回泡泡枪。三把枪都不装填，用开火间隔区分节奏；地面命中直接消失。',
    ),
    dict(
        phase='看与瞄准', title='中央稳住，外围慢慢带动镜头',
        subtitle='整片游戏画面都能开火；越过稳定区后，瞄准与镜头调整同时发生。',
        image='06-camera-progressive.png',
        caption='虚线和色带是图册的操作示意，正式游玩时可以隐藏。',
        lead='鼠标越远，转得越快，但有限速。',
        blocks=[
            ('中央区域', '我把鼠标留在中间，镜头朝向不变，只移动瞄准点。角色走动时，镜头仍会跟随位置。'),
            ('越过稳定区', '向上抬头、向下低头；左右方向的转向也用同样方式。越向外，转速逐渐增加，到上限后不再加快。外围仍然可以射击。'),
            ('保持可控', '回到中央就停转。菜单打开、窗口失焦或鼠标移出游戏区时也停转。默认上限偏慢，转向速度可以调。'),
        ],
        note='最需要试玩验证的是“追着边缘敌人开火”的手感。先调稳定区大小、加速曲线和限速；这些值还没有定稿。',
    ),
    dict(
        phase='朋友加入', title='把链接发过去，等四只龙凑齐',
        subtitle='昵称、围巾颜色、准备状态，已经足够让我知道谁是谁。',
        image='02-room-final.png',
        caption='我们都用同一种小黄龙，只用围巾颜色区分彼此。',
        lead='“小柠进来了，阿团还没准备。”',
        blocks=[
            ('我会这样做', '从入口点“和朋友玩”，创建房间，把邀请链接发给朋友。我选蓝围巾，小柠选红围巾。'),
            ('开始前只确认几件事', '人到齐了吗？这局带哪个技能？也可以在烟雾弹和闪光弹中选一种携带。选好后点准备，进入短时乱斗。'),
            ('这次先保持简单', '暂定两到四人、一张地图。大家都用这一种游戏镜头，房间里不设视角切换。'),
        ],
        note='准备过程中增加一步技能选择，见下一页。围巾用于区分玩家，不绑定武器或技能；大家都从同样的泡泡枪起步。',
    ),
    dict(
        phase='带一个技能', title='这局，我想稳一点还是凶一点？',
        subtitle='两种技能选一个，右键释放；Shift 负责所有人共有的地面短冲刺。',
        image='12-skills-v2.png',
        caption='我选泡泡盾，小柠选震震圈；下一局回到房间，可以再换一种打法。',
        lead='一个右键，留下一个临场选择。',
        blocks=[
            ('泡泡盾 · 给自己争取时间', '短时间吸收有限的弹丸伤害，耗尽或到时就消失。开盾仍可移动、开火；对手可以等它消退，也可以集火打破。'),
            ('震震圈 · 拉开近身距离', '以自己为中心，把附近同层对手沿地面推开。无伤害，不穿墙；遇墙或高台边缘就停。泡泡盾不能免疫这次推开。'),
            ('冷却也要看得懂', '释放后，图标变暗并显示剩余时间。\n每按一次右键放一次，冷却中不能再放。\n死亡不刷新冷却，回房间才能换技能。'),
        ],
        note='技能先用透明球与地面圆环表现。作用范围、盾量、持续时间与冷却都待试玩；画面里的数字仅为示意。',
    ),
    dict(
        phase='探索与交火', title='绕路，还是抢那瓶奶？',
        subtitle='地图给我一个小选择：安全地绕过去，还是冒险换一个更好的位置。',
        image='07-height-jump-controls.png',
        caption='坡道连接高台与下层场地；站上去之后，要把瞄准点向下移。',
        lead='我第一次意识到：走哪条路很重要。',
        blocks=[
            ('路上发现什么', '基础泡泡枪可以一直用。路过散射枪时按 E 换上，近处更强；奶瓶靠近就能补血。枪和补给会让我愿意走出掩体。'),
            ('交火怎样有意思', '小柠躲在箱子后。我沿坡道上高台，向下瞄准；他也能绕到另一边。泡泡有飞行时间，我要稍微瞄在他前面。'),
            ('地形现在能这样玩', '平地、矮墙、箱子、坡道，再加一块能跳下的小平台。高度改变瞄准和路线；落到下层后，还能沿坡道绕回来。'),
        ],
        note='高台提供角度，也暴露位置。枪口被墙挡住时，普通弹丸就撞墙消失；弹弹枪按一次反弹处理，任何武器都不能直接穿墙。',
    ),
    dict(
        phase='组合起来玩', title='开盾，贴近，再退回箱子后',
        subtitle='同一条坡道，因为手里的武器和保留的技能，开始出现不同选择。',
        image='13-combat-jump-controls.png',
        caption='一把散射枪、一个泡泡盾，足够让这次近身交火和刚才不同。',
        lead='我等的，就是他刚打空的那一刻。',
        blocks=[
            ('抓住一次机会', '我捡到散射枪，沿箱子靠近。\n小柠一发打空，我右键开盾，横移射击。\n弹丸撞上盾，出现一圈小波纹。'),
            ('对手也有办法', '小柠用震震圈把我推远，散射枪的优势变小。我按 Shift 冲回箱子后，等下一次机会；有盾也不能一直站着对射。'),
            ('我能读懂自己的状态', '右下角显示当前武器、所带技能与冷却。技能冷却时图标变暗；瞄准、外围转镜头与左键射击仍照常工作。'),
        ],
        note='初次原型最值得验证的是“距离、掩体、开火间隔、技能时机”能否产生选择。先体验这一段，再调伤害与冷却数值。',
    ),
    dict(
        phase='倒地与重生', title='扑通一下，三秒后又是好龙',
        subtitle='失败要看得懂，也要让我很快产生“我再试一次”的念头。',
        image='08-respawn-jump-controls.png',
        caption='身体一趴、两颗小星星、一个清楚的倒计时，就足够表达被击倒。',
        lead='这次没躲过去，但我知道下次怎么走。',
        blocks=[
            ('这一刻发生什么', '我贪着捡奶瓶，被小柠绕到侧面击倒。画面说明是谁击倒了我，镜头留在附近，倒计时三秒。'),
            ('重新回到场上', '我在出生点恢复满血，拿回泡泡枪。所带技能保留，冷却继续计时。短暂重生保护给我离开的机会；开火、放技能或投掷都会结束保护。'),
            ('继续玩的理由', '比分只落后一两次，我还追得上。下一次先看侧面，留着冲刺，不再直冲那条暴露的路线。'),
        ],
        note='重生保护用脚下白色光圈，主动泡泡盾用包住身体的蓝色球面，让我分得清两种状态。保持原来的小人物比例。',
    ),
    dict(
        phase='调到顺手', title='我的电脑，也能找到舒服的设置',
        subtitle='画质、音量和镜头速度，直接影响我愿不愿意继续玩。',
        image='09-settings-final.png',
        caption='菜单操作不会带动镜头。联机时，场上的比赛仍在继续。',
        lead='有一点卡，我先把画质调低。',
        blocks=[
            ('我能调整什么', '按 Esc 打开设置。画质选低、中、高；声音太大就调音量；外围转镜头太敏感，就把转向速度调慢。'),
            ('低画质保留什么', '角色、墙体、子弹和补给仍要清楚。可以减少尾烟粒子和阴影；烟雾遮蔽、闪光影响和技能状态必须保留。'),
            ('回到游戏', '点“继续游戏”，关闭菜单，恢复当前对局画面与操作。联机世界没有暂停，所以打开菜单前，我先找一个掩体。'),
        ],
        note='柔和闪光可以用较暗的灰雾替代刺眼白屏，但保留相同的信息遮蔽时长。阴影与透明效果的开销仍需实测。[2]',
    ),
    dict(
        phase='这一局之后', title='看完比分，我还想再来一局',
        subtitle='一场短局结束后，给我一个明确结果和一个简单的下一步。',
        image='10-results.png',
        caption='小柠赢了，我是第二。没有一长串奖励弹窗挡在“再来一局”前面。',
        lead='“刚才那条坡道，我下次先去。”',
        blocks=[
            ('结果告诉我什么', '倒计时结束，大家停火。\n榜上列出昵称、击倒数和倒地数。\n我马上就能看懂这一局的结果。'),
            ('接下来做什么', '点“再来一局”，和原来的朋友回到准备房间。也可以回练习场磨练瞄准，或打开“最近对局”查看上一把的成绩。'),
            ('我们想留下的感受', '角色可爱，操作很快学会；每次绕墙、抢补给、上高台，都有一点不同。玩完一局，自然想试另一条路线。'),
        ],
        note='后续待讨论：注册登录、评级、对局回放，以及是否需要独立观战或管理界面。本轮增加跳跃与效果想象，数值仍是草案。',
    ),
    dict(
        phase='保留一页对照', title='同一套画风，两种空间感',
        subtitle='回应最初的 2.5D / 3D 问题；这是设计对照，不是游戏里的切换功能。',
        comparison=True,
        caption='当前方向：右边的小人物、远距跟随视图，加上中央稳定区与外围渐进转向。',
        lead='现在先把右边这一种玩顺。',
        blocks=[
            ('早期斜俯视方案', '更容易一眼看清附近走位，操作主要围绕地面展开。它常被叫作 2.5D 体验，实际仍可以由三维模型渲染。'),
            ('现在认可的方案', '镜头靠近角色所在的世界，又拉远到能看清场地。坡道、高台和上下瞄准带来真正的空间关系。'),
            ('现实的制作目标', '保留同一角色、简单场景和克制特效。先做这片小花园的手感；其他画风和更大的世界以后再讨论。'),
        ],
        note='这些是 AI 生成的视觉草案。Three.js 可以组织模型、材质、相机和灯光；具体模型、动作、镜头与游戏规则仍需实现。[1]',
    ),
]


PAGES = expand_pages(PAGES)


def paragraph(text, x, top, width, size=14.2, leading=22, color=INK, bold=False):
    style = ParagraphStyle(
        'body', fontName='YaheiBold' if bold else 'Yahei', fontSize=size,
        leading=leading, textColor=color, wordWrap='CJK', splitLongWords=True,
        allowWidows=0, allowOrphans=0,
    )
    p = Paragraph(escape(text).replace('\n', '<br/>'), style)
    _, ph = p.wrap(width, 2000)
    p.drawOn(c, x, top - ph)
    return top - ph


def picture(file, x, y, width, height, rounded=True):
    c.saveState()
    if rounded:
        clip = c.beginPath()
        clip.roundRect(x, y, width, height, 12)
        c.clipPath(clip, stroke=0, fill=0)
    c.drawImage(ImageReader(str(ASSETS / file)), x, y, width=width,
                height=height, preserveAspectRatio=True, anchor='c', mask='auto')
    c.restoreState()


OUTPUT.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(OUTPUT), pagesize=(W, H), pageCompression=1)
c.setTitle('奶龙竞技场｜一次试玩想象')
c.setAuthor('游戏体验设计草案')
c.setSubject('跳跃、空中攻击、冰霜、火箭、烟雾与闪光；武器行为与特效描述的体验草案')
layout_audit = []

for index, page in enumerate(PAGES, 1):
    c.setFillColor(BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.roundRect(40, 670, 31, 22, 6, fill=1, stroke=0)
    c.setFillColor(HexColor('#FFFFFF'))
    c.setFont('YaheiBold', 11)
    c.drawCentredString(55.5, 677, f'{index:02d}')
    c.setFillColor(TEAL)
    c.setFont('YaheiBold', 11)
    c.drawString(82, 677, page['phase'])
    c.setFillColor(MUTED)
    c.setFont('Yahei', 10)
    c.drawRightString(1112, 677, '奶龙竞技场 / 一次试玩想象 / 2026.10.30')

    paragraph(page['title'], 40, 652, 1072, 30, 38, INK, True)
    paragraph(page['subtitle'], 41, 608, 1065, 12, 19, MUTED)

    if page.get('comparison'):
        c.setFillColor(HexColor('#E8EDE1'))
        c.roundRect(40, 161, 684, 427.5, 12, fill=1, stroke=0)
        picture('02-practice.png', 54, 332, 321, 200.625)
        picture('05-thirdperson-jump-controls.png', 389, 332, 321, 200.625)
        paragraph('早期斜俯视', 55, 565, 310, 16, 23, INK, True)
        paragraph('当前认可的视图', 390, 565, 310, 16, 23, TEAL, True)
        paragraph('更容易看清附近全局', 55, 316, 310, 13, 20, MUTED)
        paragraph('更像跟着小龙走进场地', 390, 316, 310, 13, 20, MUTED)
        paragraph('相同的角色、材质与场景。\n差别是，我们站在哪里看世界。',
                  76, 258, 607, 21, 32, INK, True)
    elif page.get('panel'):
        draw_panel(c, paragraph, page['panel'])
    else:
        picture(page['image'], 40, 161, 684, 427.5)

    paragraph(page['caption'], 43, 146, 675, 11.4, 17.5, MUTED)

    y = paragraph(page['lead'], 756, 586, 356, 19, 29, INK, True) - 21
    for title, text in page['blocks']:
        y = paragraph(title, 756, y, 356, 11.4, 17, TEAL, True) - 5
        y = paragraph(text, 756, y, 356, 14.2, 22.5, INK) - 18
    assert y >= 127, f'Page {index} right column overflow: {y}'
    layout_audit.append({'page': index, 'right_bottom': round(y, 2)})

    c.setStrokeColor(LINE)
    c.setLineWidth(0.75)
    c.line(40, 108, 1112, 108)
    c.setFillColor(GOLD)
    c.circle(45, 86, 3, fill=1, stroke=0)
    paragraph(page['note'], 58, 96, 1054, 10.6, 17, MUTED)

    c.setFont('Yahei', 8.8)
    c.setFillColor(MUTED)
    c.drawString(40, 27, '体验概念图 · 非运行截图 · 功能与手感仍待试玩验证')
    c.drawRightString(1112, 27, f'{index:02d} / {len(PAGES):02d}')
    if page.get('comparison'):
        c.setFont('Yahei', 8)
        c.drawString(440, 27, '[1] Three.js 基础')
        c.linkURL('https://threejs.org/manual/pages/fundamentals.html', (438, 23, 547, 38))
        c.drawString(566, 27, '[2] Three.js 阴影')
        c.linkURL('https://threejs.org/manual/pages/shadows.html', (564, 23, 674, 38))

    if page.get('sources'):
        for source_index, (label, url) in enumerate(page['sources']):
            sx = 440 + source_index * 180
            c.setFont('Yahei', 8)
            c.drawString(sx, 27, label)
            c.linkURL(url, (sx - 2, 23, sx + 170, 38))

    c.showPage()

c.save()
(PROJECT / 'source' / 'story.json').write_text(json.dumps(PAGES, ensure_ascii=False, indent=2), encoding='utf-8')
(WORKSPACE / 'tmp' / 'pdfs' / 'nailong-experience' / 'layout-audit.json').write_text(
    json.dumps(layout_audit, ensure_ascii=False, indent=2), encoding='utf-8')
print(OUTPUT)
print(f'{len(PAGES)} pages; {OUTPUT.stat().st_size / (1024*1024):.2f} MiB')
