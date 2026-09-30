# Schuaz: Product Hunt launch package

Everything here was checked against the app's code and the Demo Household on 2026-09-26. Specs are from Product Hunt's help center as of the same date: description ≤ 260 characters, 240×240 thumbnail, 1270×760 gallery images (at least 2), YouTube-only video, a first comment is required, and posts go live at 12:01 AM PT. **Re-check the form limits when you create the post. Product Hunt changes them.**

Items in `[brackets]` are for you to fill in. I didn't invent anything about you or your history.

---

## 1. Listing fields

**Name:** Schuaz

**Tagline** (pick one; each is ≤ 60 characters):
1. `Your household's stuff, spending and to-dos. Just ask.` (54): **recommended**; matches the store copy
2. `Ask your home where anything is, in plain English` (49): sharpest hook
3. `Home inventory + budgets you can ask in plain English` (53): most literal for PH browsers

**Description** (≤ 260 characters; this one is 259):

> Schuaz is where your household's stuff, spending and to-dos live, and you can ask it anything. "Where's the drill?" → Garage › Shelf 2 › Toolbox. Snap a shelf and AI fills in the details. Sync bank accounts, spot recurring bills, share it with your household.

**Links:** https://schuaz.com. Add App Store and Google Play links **only if the apps are live on launch day.**

**Pricing:** Free options (Free plan, plus paid plans). Free: up to 3 locations and 100 items. Plus: $7.99/mo. Pro: $14.99/mo. No credit card required. Source: `src/app/page.tsx` and `src/lib/billing.ts`.

**Topics** (keep it to a few): Productivity, Personal Finance, Artificial Intelligence, Home. Alternates if a topic isn't available: Organization, Family.

**Thumbnail:** `thumbnail-240.png` (the app icon)

**Gallery** (upload in this order; the `@2x` files are sharper if PH accepts them):
| # | File | Message |
|---|---|---|
| 1 | `gallery/01-hero.png` | Just ask your home. (iPad + iPhone) |
| 2 | `gallery/02-ask.png` | Where's the drill? The real answer |
| 3 | `gallery/03-capture.png` | Snap a shelf. Review. Save. (labelled Plus & Pro) |
| 4 | `gallery/04-money.png` | See where the money goes |
| 5 | `gallery/05-ask-money.png` | Ask about money, too: the real Costco answer |
| 6 | `gallery/06-household.png` | Shared with everyone at home |

**Video:** upload `../product-video/exports/schuaz-promo-master-16x9-4k.mp4` (30 s) to YouTube as **Unlisted**, then paste the **full** youtube.com URL; PH rejects short links. Note: the music is registered with YouTube Content ID, so expect an informational claim. Keep the Pixabay license link from `../product-video/LICENSES.md` handy.

**Makers:** [your PH username]. **Shoutouts:** optional, e.g. the tools you actually build with.

---

## 2. Maker's first comment (post it the moment the launch goes live)

> Hey Product Hunt 👋 I'm [name], the maker of Schuaz.
>
> In our house I'm the person who gets asked "where's the ___?" [one sentence of your own real story: the moment that made you build this].
>
> Schuaz is one place for everything about a household, and you can just **ask it**, in plain English:
>
> - 🔎 **"Where's the drill?"** → *Garage › Shelf 2 › Toolbox.* Items live in locations and containers (even nested ones), and every answer links straight to the item.
> - 📸 **Snap a shelf.** AI reads the photo and suggests names, categories and values. You review it and choose where things go before anything is saved.
> - 💸 **Money:** bank sync via Plaid (read-only), receipt scanning, CSV import, automatic recurring-bill detection, and charts. Then ask "How much did we spend at Costco last month?"
> - ✅ **Tasks, reminders and shared notes**, with push notifications.
> - 🏠 **Built for households**, not a single login. Everyone at home shares the same inventory, bills and tasks.
>
> It's free to start (up to 3 locations and 100 items, no card). Plus ($7.99/mo) and Pro ($14.99/mo) unlock unlimited items, bank imports and more.
>
> I'd love your honest feedback, especially: **what's the first thing you'd ask your home?** I'm here all day answering questions. 🙏

---

## 3. Ready replies to likely questions (all checked against the code)

**"Is my financial data safe? Can it move money?"**
> Bank connections go through Plaid, and Schuaz only requests read access to transactions and liabilities. It can't move money. You can disconnect a bank at any time, export your data, or delete your account from Settings. We don't sell personal information; the details are at schuaz.com/privacy.

**"Which AI do you use? Is my data used for training?"**
> AI features (Ask, photo capture, receipt reading, category suggestions, voice) run through Vercel AI Gateway on models from Google and OpenAI. [Confirm the gateway/provider data-retention settings before answering the training half. Don't claim "never used for training" unless you've verified it.]

**"How is this different from Sortly / Encircle / a spreadsheet?"**
> Those are great for cataloging. Schuaz is built around *asking*: one place that connects your stuff, your spending and your to-dos, so "Is the TV still under warranty?" or "What did we spend on utilities?" gets an answer instead of a search. It's also shared by the whole household by default.

**"Does it work on iPhone/Android?"**
> [If the store apps are live, give both links. If not: "It runs in any browser today at schuaz.com; the iOS and Android apps are [status]."]

**"Why does AI capture need Plus?"**
> [⚠️ Decide first. The plan copy lists AI-assisted capture under Plus, but the capture endpoint isn't currently plan-gated. Either gate it or change the gallery label and this answer.]

**"What's next?"**
> [Your real roadmap. Candidates the codebase already hints at: Home Assistant integration, deeper household workflows.]

---

## 4. Social / community copy

**X / Threads / LinkedIn (launch morning):**
> We're live on Product Hunt 🚀
> Schuaz: your household's stuff, spending and to-dos, and you can just ask.
> "Where's the drill?" → Garage › Shelf 2 › Toolbox.
> Would love your feedback 👉 [PH link]

**Short (DMs to friends, *not* asking for upvotes; PH penalizes that):**
> I launched Schuaz on Product Hunt today, an app you can ask where things are at home. I'd genuinely love your feedback: [PH link]

**Vertical video for social:** `../product-video/exports/schuaz-promo-vertical-9x16.mp4` (30 s)

---

## 5. Launch-day checklist

**One to two weeks before**
- [ ] Resolve the AI-capture plan gating (see §3).
- [ ] Decide on store links: live, or web-only.
- [ ] Renew the Demo Household subscription (Plus lapsed 2026-09-26) if you'll demo paid features live or re-shoot.
- [ ] Create the post as a **scheduled draft**, fill in all fields, and preview it on mobile.
- [ ] Upload the video to YouTube (unlisted, ads off) and paste the full URL.
- [ ] Make sure the schuaz.com sign-up → first item → first Ask flow works on a fresh account.

**Launch day (goes live 12:01 AM PT)**
- [ ] Post the first comment immediately.
- [ ] Share on your own channels. Link to the post and ask for *feedback*, not upvotes.
- [ ] Reply to every comment within the hour, all day.
- [ ] Watch Vercel and Supabase for sign-up spikes, and keep an eye on AI Gateway spend.

**After**
- [ ] Thank commenters, and collect feature requests into `docs/bugs.md` / the backlog.
- [ ] Add the Product Hunt badge to schuaz.com only if you want it.

---

## Files

```
store-assets/product-hunt/
  PRODUCT_HUNT.md        this package
  thumbnail-240.png      240×240 thumbnail
  gallery/*.png          1270×760 (and @2x 2540×1520) gallery, real Demo Household screens
  make_gallery.py        regenerates the gallery from ../product-video/clips
```
