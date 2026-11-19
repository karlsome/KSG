"""Japanese diagrams for the admin / leader edition (fig_ja_*.png). Pillow + Hiragino (macOS)."""
import math
import sys
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
FONT = "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc"
FONT_B = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"
S = 2  # supersample


def f(size, bold=False):
    return ImageFont.truetype(FONT_B if bold else FONT, size * S)


INK = (30, 41, 59)
MUTED = (100, 116, 139)
LINE = (148, 163, 184)
COLORS = {
    "plc": ((254, 243, 199), (217, 119, 6)),
    "pi": ((220, 252, 231), (22, 163, 74)),
    "cloud": ((224, 231, 255), (79, 70, 229)),
    "db": ((241, 245, 249), (71, 85, 105)),
    "tab": ((252, 231, 243), (219, 39, 119)),
    "admin": ((224, 242, 254), (2, 132, 199)),
}


class Canvas:
    def __init__(self, w, h):
        self.img = Image.new("RGB", (w * S, h * S), "white")
        self.d = ImageDraw.Draw(self.img)

    def box(self, x, y, w, h, title, lines=(), kind="db", title_size=17, line_size=13):
        fill, edge = COLORS[kind]
        self.d.rounded_rectangle([x * S, y * S, (x + w) * S, (y + h) * S], radius=12 * S,
                                 fill=fill, outline=edge, width=2 * S)
        ty = y + 12
        self.d.text(((x + w / 2) * S, ty * S), title, font=f(title_size, True), fill=INK, anchor="ma")
        ty += title_size + 12
        for ln in lines:
            self.d.text(((x + w / 2) * S, ty * S), ln, font=f(line_size), fill=MUTED, anchor="ma")
            ty += line_size + 7

    def zone(self, x, y, w, h, label):
        self.d.rounded_rectangle([x * S, y * S, (x + w) * S, (y + h) * S], radius=16 * S,
                                 outline=LINE, width=2 * S, fill=(250, 250, 252))
        self.d.text(((x + 14) * S, (y + 10) * S), label, font=f(14, True), fill=MUTED)

    def arrow(self, x1, y1, x2, y2, label="", both=False, lx=None, ly=None, color=INK):
        self.d.line([x1 * S, y1 * S, x2 * S, y2 * S], fill=color, width=3 * S)
        self._head(x1, y1, x2, y2, color)
        if both:
            self._head(x2, y2, x1, y1, color)
        if label:
            mx = lx if lx is not None else (x1 + x2) / 2
            my = ly if ly is not None else (y1 + y2) / 2 - 20
            for i, part in enumerate(label.split("\n")):
                self.d.text((mx * S, (my + i * 18) * S), part, font=f(13), fill=INK, anchor="ma")

    def _head(self, x1, y1, x2, y2, color):
        a = math.atan2(y2 - y1, x2 - x1)
        L = 12
        p = [(x2, y2), (x2 - L * math.cos(a - 0.4), y2 - L * math.sin(a - 0.4)),
             (x2 - L * math.cos(a + 0.4), y2 - L * math.sin(a + 0.4))]
        self.d.polygon([(px * S, py * S) for px, py in p], fill=color)

    def text(self, x, y, t, size=13, bold=False, color=MUTED, anchor="la"):
        self.d.text((x * S, y * S), t, font=f(size, bold), fill=color, anchor=anchor)

    def save(self, name):
        w, h = self.img.size
        self.img.resize((w // S, h // S), Image.LANCZOS).save(f"{OUT}/{name}", optimize=True)


# ---------- 全体図（簡易版） ----------
c = Canvas(1200, 560)
c.zone(20, 20, 560, 520, "工場（本社工場 / 浅野工場）")
c.zone(620, 20, 560, 520, "インターネット（クラウド）")
c.box(50, 70, 220, 110, "機械（KV8000 PLC）", ["生産数・看板の値を持つ"], "plc")
c.box(330, 70, 220, 110, "ラズベリーパイ", ["機械の値を読み取り", "サーバーへ送る"], "pi")
c.arrow(270, 125, 330, 125)
c.box(330, 260, 220, 110, "タブレット", ["作業者が使う画面", "QRコード / URL で開く"], "tab")
c.box(330, 410, 220, 110, "事務所のPC", ["管理サイト", "（Master DB など）"], "admin")
c.box(720, 220, 380, 130, "KSGサーバー", ["https://ksg.freyaaccess.com", "登録データ・作業データを保存", "機械の値をタブレットへ届ける"], "cloud", 18)
c.box(760, 410, 300, 100, "Googleスプレッドシート", ["（製品により任意で転記）"], "db", 16)
c.arrow(550, 120, 720, 250, "機械の値", lx=650, ly=150)
c.arrow(550, 315, 720, 300, "ログイン・生産数・\nデータ送信", both=True, lx=635, ly=250)
c.arrow(550, 465, 720, 340, "登録・確認", both=True, lx=620, ly=425)
c.arrow(910, 350, 910, 410)
c.text(40, 210, "ポイント", 14, True, INK)
for i, t in enumerate(["タブレットは機械と直接", "つながっていません。", "値は 機械 → ラズパイ →", "サーバー → タブレット", "の順に届きます。", "", "タブレットに必要なのは", "Wi-Fi（インターネット）と", "自分のURL / QRコードだけ。"]):
    c.text(40, 238 + i * 22, t, 13)
c.save("fig_ja_overview.png")

# ---------- 登録の順番 ----------
c = Canvas(1200, 310)
steps = [
    ("1 工場", ["Master DB › Factory", "例：本社工場"], "admin"),
    ("2 ラズパイ/OPC", ["技術担当が準備", "値が届いているか確認"], "pi"),
    ("3 設備", ["Master DB › Equipment", "工場＋OPC変数"], "plc"),
    ("4 製品", ["Master DB › Master", "設備・kanbanID", "収容数"], "db"),
    ("5 ユーザー", ["User Management", "工場＋設備"], "tab"),
    ("6 タブレット", ["Master DB › Tablet", "名前・工場・設備"], "cloud"),
    ("7 端末", ["URL / QRで開く", "ログイン・テスト"], "tab"),
]
x = 20
for i, (t, ls, k) in enumerate(steps):
    c.box(x, 60, 150, 115, t, ls, k, 16, 11)
    if i < len(steps) - 1:
        c.arrow(x + 150, 117, x + 170, 117)
    x += 170
c.text(600, 18, "この順番で登録します（各ステップは前のステップが必要）", 17, True, INK, "ma")
c.text(20, 205, "手動モードのタブレットは看板の設定は不要ですが、送信には生産数の変数が必ず必要です。", 14)
c.text(20, 231, "1〜4 は通常、機械ごとに1回だけ。5 は新しい作業者がその機械に入るたびに行います。", 14)
c.text(20, 257, "6 の後に任意で：トラブルグループ（Master DB › Troubles）、製品の不良グループ、Googleスプレッドシート。", 14)
c.save("fig_ja_order.png")

# ---------- 看板モード / 手動モード ----------
c = Canvas(1200, 520)
c.box(420, 20, 360, 80, "タブレットを開く", ["登録された設備の設定を読み込む"], "cloud")
c.arrow(600, 100, 600, 145)
c.box(380, 145, 440, 80, "設備に Kanban Variable が設定されている？", [], "db", 16)
c.arrow(380, 185, 230, 260, "はい", lx=290, ly=195)
c.arrow(820, 185, 970, 260, "いいえ（空欄）", lx=920, ly=195)
c.box(40, 260, 380, 240, "看板モード", [
    "機械の看板の値で製品が自動で決まる",
    "看板の値 → Master DB の kanbanID",
    "作業者は製品を変更できない",
    "タイトル：検査カウンター（製品名, kanbanID）",
    "「9999」や未登録の看板は無視",
    "未送信中に看板が変わると確認画面",
    "例：本社工場 ピラーライン（050D, 440D）",
], "plc")
c.box(780, 260, 380, 240, "手動モード", [
    "作業者が製品を選ぶ（製品選択 / 変更）",
    "一覧＝設備がこの機械の製品",
    "→ なければ同じ工場の全製品",
    "→ それもなければ先頭100件",
    "製品が1つだけなら自動で選択",
    "選んだ製品は設備ごとに記憶",
    "例：浅野工場（R743, W312, 670B …）",
], "pi")
c.text(600, 300, "どちらのモードも", 14, True, INK, "ma")
c.text(600, 326, "作業数は機械の生産数から", 13, False, MUTED, "ma")
c.text(600, 352, "合格数 ＝ 作業数 − 不良", 13, False, MUTED, "ma")
c.text(600, 378, "送信方法も同じ", 13, False, MUTED, "ma")
c.save("fig_ja_modes.png")
print("ok")
