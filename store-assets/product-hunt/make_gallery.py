#!/usr/bin/env python3
"""Product Hunt gallery (1270x760, plus @2x) and thumbnail, composed from real Demo Household
captures via the product-video compositor. No app UI is redrawn."""
import os, sys, cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "product-video", "project"))
import build as B

W, H = 2540, 1520
OUT = os.path.join(HERE, "gallery"); os.makedirs(OUT, exist_ok=True)
CL = B.CLIPS

def frame(name, t): return cv2.imread(B.first_path(name, t))
def still(name): return cv2.imread(os.path.join(CL, name))

def text_block(c, head, sub, badge=None, x=170, y=None):
    hl = B.text_layer(head, 118, "Bold", B.INK, 900, "left", 1.06)
    sl = B.text_layer(sub, 50, "Regular", B.MUTED, 860, "left", 1.3) if sub else None
    pl = B.pill_layer(badge, 40, B.WHITE, B.SAGE) if badge else None
    h = hl[1].shape[0] + (40 + sl[1].shape[0] if sl else 0) + (44 + pl[1].shape[0] if pl else 0)
    yy = (H - h) / 2 if y is None else y
    yy += B.place(c, hl, x, yy, "tl")
    if sl: yy += 40; yy += B.place(c, sl, x, yy, "tl")
    if pl: yy += 44; B.place(c, pl, x, yy, "tl")

def brand(c):
    ic = B.app_icon(84); B.place(c, ic, 170, 120, "tl")
    B.place(c, B.text_layer("Schuaz", 54, "Bold", B.INK), 275, 134, "tl")

def device(c, kind, img, cx, cy, h):
    rgb, a, shd = B.render_device(kind, img, h); B.composite(c, rgb, a, cx, cy, 1.0, 1.0, shd)

def bg():
    return B.make_bg(W, H, dict(phone=(1800, 780, 1300)))

def save(c, name):
    im = np.clip(c, 0, 255).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, f"{name}@2x.png"), im)
    cv2.imwrite(os.path.join(OUT, f"{name}.png"), cv2.resize(im, (1270, 760), interpolation=cv2.INTER_AREA))

ask_answer = frame("iphone-shot-02-04-ask.mp4", 22.6)
home = frame("iphone-shot-01-home.mp4", 0.4)
ipad_over = frame("ipad-shot-08-overview.mp4", 0.4)
ipad_ask = still("ipad-still-02-ask-answer.png")
review = frame("iphone-shot-05-capture-clean.mp4", 33.0)
money_ipad = still("ipad-still-07-money.png")
money_phone = frame("iphone-shot-06a-money.mp4", 9.0)
costco = still("iphone-still-07-costco-answer.png")
garage = frame("ipad-shot-07b-garage.mp4", 10.0)
item = frame("iphone-shot-04b-item.mp4", 11.0)

# 1 hero
c = bg(); brand(c)
text_block(c, "Just ask your home.", "The one place for your household's stuff, spending, and to-dos, and you can ask it anything in plain English.")
device(c, "ipad", ipad_over, 1720, 800, 1180); device(c, "iphone", ask_answer, 2180, 880, 1180)
save(c, "01-hero")

# 2 ask (push-in on the real answer)
c = bg(); brand(c)
text_block(c, "Where's the drill?", "Ask in plain English. Schuaz answers from what your household has saved: the exact location, down to the bin.")
crop = ask_answer[0:1250, :]                      # top of the real Ask sheet: question, answer, item card
card = cv2.resize(crop, (int(crop.shape[1] * 1.05), int(crop.shape[0] * 1.05)), interpolation=cv2.INTER_AREA)
device(c, "iphone", ask_answer, 1870, 830, 1300)
m = B.rrect_mask(card.shape[1], card.shape[0], 44)
sh = np.zeros((card.shape[0] + 160, card.shape[1] + 160), np.float32); sh[100:-60, 80:-80] = 1; sh = cv2.GaussianBlur(sh, (0, 0), 30) * 0.18
rgb = np.full((sh.shape[0], sh.shape[1], 3), 255, np.float32); a = np.zeros_like(sh)
rgb[80:-80, 80:-80] = card; a[80:-80, 80:-80] = m
B.composite(c, rgb, a, 1900, 560, 0.62, 1.0, sh)
save(c, "02-ask")

# 3 capture
c = bg(); brand(c)
text_block(c, "Snap a shelf. Review. Save.", "AI reads the photo and fills in names, categories and values. You check them, pick where they live, and save.", badge="Plus & Pro")
device(c, "iphone", review, 1880, 800, 1320)
save(c, "03-capture")

# 4 money
c = bg(); brand(c)
text_block(c, "See where the money goes.", "Cash flow, spending by category, and automatically detected recurring bills, from bank sync, CSV or receipts.")
device(c, "ipad", money_ipad, 1790, 800, 1240)
save(c, "04-money")

# 5 ask about money
c = bg(); brand(c)
text_block(c, "Ask about money, too.", "\"How much did we spend at Costco last month?\" The answer comes from your own transactions.")
device(c, "iphone", costco, 1650, 800, 1300); device(c, "iphone", money_phone, 2180, 860, 1180)
save(c, "05-ask-money")

# 6 shared household
c = bg(); brand(c)
text_block(c, "Shared with everyone at home.", "One household: the same inventory, bills, notes and tasks on every phone, tablet and browser.")
device(c, "ipad", garage, 1720, 790, 1180); device(c, "iphone", item, 2200, 880, 1100)
save(c, "06-household")

# thumbnail 240x240 (square app icon, full-bleed)
icon = cv2.imread(os.path.join(B.REPO, "assets", "icon-only.png"))
cv2.imwrite(os.path.join(HERE, "thumbnail-240.png"), cv2.resize(icon, (240, 240), interpolation=cv2.INTER_AREA))
print("ok", sorted(os.listdir(OUT)))
