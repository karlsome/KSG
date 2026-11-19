"""Draws the guide's diagrams as PNGs with Pillow (Hiragino for Japanese text)."""
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

    def box(self, x, y, w, h, title, lines=(), kind="db", title_size=17):
        fill, edge = COLORS[kind]
        self.d.rounded_rectangle([x * S, y * S, (x + w) * S, (y + h) * S], radius=12 * S,
                                 fill=fill, outline=edge, width=2 * S)
        ty = y + 12
        self.d.text(((x + w / 2) * S, ty * S), title, font=f(title_size, True), fill=INK, anchor="ma")
        ty += title_size + 10
        for ln in lines:
            self.d.text(((x + w / 2) * S, ty * S), ln, font=f(12), fill=MUTED, anchor="ma")
            ty += 18

    def zone(self, x, y, w, h, label):
        self.d.rounded_rectangle([x * S, y * S, (x + w) * S, (y + h) * S], radius=16 * S,
                                 outline=LINE, width=2 * S, fill=(250, 250, 252))
        self.d.text(((x + 14) * S, (y + 10) * S), label, font=f(13, True), fill=MUTED)

    def arrow(self, x1, y1, x2, y2, label="", both=False, lx=None, ly=None, color=INK):
        self.d.line([x1 * S, y1 * S, x2 * S, y2 * S], fill=color, width=3 * S)
        self._head(x1, y1, x2, y2, color)
        if both:
            self._head(x2, y2, x1, y1, color)
        if label:
            mx = lx if lx is not None else (x1 + x2) / 2
            my = ly if ly is not None else (y1 + y2) / 2 - 18
            for i, part in enumerate(label.split("\n")):
                self.d.text((mx * S, (my + i * 16) * S), part, font=f(12), fill=INK, anchor="ma")

    def _head(self, x1, y1, x2, y2, color):
        import math
        a = math.atan2(y2 - y1, x2 - x1)
        L = 12
        p = [(x2, y2), (x2 - L * math.cos(a - 0.4), y2 - L * math.sin(a - 0.4)),
             (x2 - L * math.cos(a + 0.4), y2 - L * math.sin(a + 0.4))]
        self.d.polygon([(px * S, py * S) for px, py in p], fill=color)

    def text(self, x, y, t, size=12, bold=False, color=MUTED, anchor="la"):
        self.d.text((x * S, y * S), t, font=f(size, bold), fill=color, anchor=anchor)

    def save(self, name):
        w, h = self.img.size
        self.img.resize((w // S, h // S), Image.LANCZOS).save(f"{OUT}/{name}", optimize=True)


# ---------- Figure 1: system architecture ----------
c = Canvas(1200, 640)
c.zone(20, 20, 520, 600, "FACTORY LAN (per factory: 本社工場 / 浅野工場)")
c.zone(580, 20, 600, 600, "INTERNET / CLOUD")
c.box(50, 70, 200, 120, "KV8000 PLC", ["Keyence, OPC UA server", "opc.tcp://<PLC IP>:4840", "e.g. 192.168.0.20"], "plc")
c.box(310, 70, 200, 120, "Raspberry Pi", ["opcua_client.py (systemd)", "uniqueId e.g. 6C10F6", "e.g. 192.168.24.40"], "pi")
c.arrow(250, 130, 310, 130, "OPC UA :4840", ly=140)
c.box(310, 280, 200, 110, "Tablet (browser)", ["tablet.html?tabletName=…", "kanban or manual mode", "Wi-Fi / LAN"], "tab")
c.box(310, 440, 200, 110, "Admin PC (browser)", ["Master DB, OPC Mgmt,", "User Management,", "Submitted Data"], "admin")
c.box(700, 230, 360, 150, "ksgServer.js  (Node.js)", ["https://ksg.freyaaccess.com", "REST API + Socket.IO", "serves tablet & admin pages", "relays OPC values to tablets"], "cloud", 18)
c.box(640, 470, 220, 110, "MongoDB Atlas", ["KSG: tabletDB, equipment,", "masterDB, users, submittedDB,", "opcua_* , tabletActiveSessions"], "db")
c.box(900, 470, 230, 110, "Google Sheets", ["registered targets", "(optional, per product)"], "db")
c.box(860, 60, 260, 100, "Sasaki_Coating_MasterDB", ["masterUsers.devices.uniqueId", "(Pi authorisation)"], "db", 15)
c.arrow(510, 110, 700, 260, "HTTPS + WebSocket\nconfig / data / heartbeat", lx=640, ly=130)
c.arrow(510, 335, 700, 320, "login, live values,\nsubmit (HTTPS/Socket.IO)", both=True, lx=605, ly=280)
c.arrow(510, 495, 700, 370, "HTTPS", both=True, lx=590, ly=455)
c.arrow(780, 380, 760, 470)
c.arrow(980, 380, 1010, 470)
c.arrow(990, 230, 990, 160)
c.text(40, 230, "Rules of thumb:", 13, True, INK)
for i,t in enumerate(["Pi must reach the PLC on the LAN", "AND the internet (HTTPS 443).", "", "Tablets never talk to the PLC", "or the Pi directly. Every value", "goes PLC → Pi → server → tablet.", "", "One Pi can serve many", "equipments (many variables).", "", "The tablet only needs the", "internet + its URL / QR code."]):
    c.text(40, 256+i*19, t, 12)
c.save("fig_architecture.png")

# ---------- Figure 2: registration order ----------
c = Canvas(1200, 300)
steps = [
    ("1  Factory", ["Master DB › Factory", "e.g. 本社工場"], "admin"),
    ("2  Pi + OPC", ["Rpi Server / OPC UA", "variables exist"], "pi"),
    ("3  Equipment", ["Master DB › Equipment", "factory + OPC vars"], "plc"),
    ("4  Products", ["Master DB › Master", "設備, kanbanID, 収容数"], "db"),
    ("5  Users", ["User Management", "factory + equipment"], "tab"),
    ("6  Tablet", ["Master DB › Tablet", "name, factory, equip."], "cloud"),
    ("7  Device", ["open URL / QR", "log in, test"], "tab"),
]
x = 20
for i, (t, ls, k) in enumerate(steps):
    c.box(x, 60, 150, 110, t, ls, k, 16)
    if i < len(steps) - 1:
        c.arrow(x + 150, 115, x + 170, 115)
    x += 170
c.text(600, 20, "Register in this order — each step needs the one before it", 16, True, INK, "ma")
c.text(20, 200, "Manual-mode tablets can skip the kanban part of step 2/3, but still need a production-count variable to be able to submit.", 13)
c.text(20, 224, "Steps 1–4 are usually done once per machine. Step 5 is repeated whenever a new operator joins that machine.", 13)
c.text(20, 248, "Optional extras after step 6: Trouble group (Master DB › Troubles), Defect group on the product, Google Sheets target.", 13)
c.save("fig_order.png")

# ---------- Figure 3: kanban vs manual decision ----------
c = Canvas(1200, 520)
c.box(420, 20, 360, 90, "Tablet opens", ["reads its equipment (設備名) from tabletDB", "→ GET /api/tablet/equipment-config"], "cloud")
c.arrow(600, 110, 600, 150)
c.box(400, 150, 400, 80, "Does the equipment have a Kanban Variable?", [], "db", 15)
c.arrow(400, 190, 230, 260, "YES", lx=300, ly=200)
c.arrow(800, 190, 970, 260, "NO (blank)", lx=900, ly=200)
c.box(40, 260, 380, 230, "KANBAN MODE", [
    "Product comes from the PLC kanban value",
    "value → masterDB.kanbanID → 品番 / 製品名",
    "No product buttons — operator cannot change it",
    "Title: 検査カウンター（製品名, kanbanID）",
    "Ignores '9999' and unknown kanban values",
    "New kanban during unsent work → conflict popup",
    "Example: 本社工場 pillar lines (050D, 440D)",
], "plc")
c.box(780, 260, 380, 230, "MANUAL MODE", [
    "Operator picks the product (製品選択 / 変更)",
    "List = products whose 設備 = this equipment",
    "→ else all products of the factory",
    "→ else first 100 products",
    "Only one product → selected automatically",
    "Choice remembered per equipment in the browser",
    "Example: 浅野工場 lines (R743, W312, 670B …)",
], "pi")
c.text(600, 300, "Both modes:", 13, True, INK, "ma")
c.text(600, 322, "作業数 from the production-", 12, False, MUTED, "ma")
c.text(600, 340, "count variable (seisanSu…)", 12, False, MUTED, "ma")
c.text(600, 366, "合格数 = 作業数 − NG", 12, False, MUTED, "ma")
c.text(600, 392, "Same submit → submittedDB", 12, False, MUTED, "ma")
c.text(600, 410, "(+ Google Sheets)", 12, False, MUTED, "ma")
c.save("fig_modes.png")
print("ok")
