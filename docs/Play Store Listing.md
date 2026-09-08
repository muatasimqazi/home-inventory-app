# Schuaz — Play Store Listing

Reference copy for the Play Console store listing form and Data Safety section. Fact-checked against what the app actually does — no invented features, no undisclosed data collection.

## App details

- **App name** (max 30): `Schuaz`
- **Short description** (max 80 — this one is 75):
  `Track your home's stuff, spending, and to-dos — just ask, in plain English.`
- **Category**: Lifestyle (or House & Home if available in your account's category list)

## Full description (max 4000)

```
Schuaz is the one place everything about your household actually lives — and you can just ask it questions instead of digging through folders, spreadsheets, or your own memory.

WHAT'S IN YOUR HOME
Catalog items with photos, organize them by location and container, and print QR/NFC labels so anything you own is one scan away. AI-assisted capture reads a photo and fills in the details for you — no manual data entry.

JUST ASK
"Where's the drill?" "How much did we spend at Costco last month?" "Is the TV still under warranty?" Schuaz's Ask AI answers in plain English, using your household's real data — not a generic chatbot. Ask by typing or by voice, and get a spoken answer back.

MONEY
Link bank accounts, scan receipts, and track spending by category. Schuaz automatically detects recurring bills and subscriptions, tracks budgets, and keeps a full picture of your household's finances in one place.

TASKS & REMINDERS
Chores, reminders, and appointments with real due dates, checklists, and push notifications — including a daily weather-based reminder for what to wear.

BUILT FOR THE WHOLE HOUSEHOLD
Invite the people you share a home with. Everyone sees the same inventory, the same bills, and the same task list — no more "did you take care of that?" texts.

Free to start. Upgrade for bank account syncing, AI-assisted capture, and email receipt forwarding.
```

## Graphics checklist

| Asset | Spec | Status |
|---|---|---|
| Hi-res icon | 512×512, 32-bit PNG | ✅ `assets/icon-only.png` |
| Feature graphic | 1024×500, no alpha | ✅ `store-assets/feature-graphic.png` |
| Phone screenshots | 2–8, real device sizes | ✅ `store-assets/screenshots/*.png` (5, 1080×2400, Demo Household — no real user data) |

## Data safety section — real answers

Google's Data Safety form asks what data the app *collects and shares*, per category. Answer from what the code actually does, not aspirationally:

| Data type | Collected? | Shared with third parties? | Purpose | Notes |
|---|---|---|---|---|
| **Name** | Yes | No | Account management, App functionality | Household member display name |
| **Email address** | Yes | No | Account management, App functionality | Supabase Auth |
| **User IDs** | Yes | No | Account management, Analytics | Supabase user id; also the PostHog `distinct_id` |
| **Physical address / Location (approximate)** | Yes | Yes — Google (weather), AI Gateway providers (geocoding) | App functionality | Household location for weather-based reminders; geocoded via `/api/v1/weather/geocode` |
| **Photos** | Yes | Yes — AI Gateway model providers | App functionality | Item/location/receipt photos, sent for AI detection/generation when the user captures via AI-assisted flows |
| **Financial info (purchase history, other financial info)** | Yes | Yes — Plaid, Stripe | App functionality, Account management | Bank-linked transactions (Plaid, opt-in), receipts, subscription billing (Stripe) |
| **App activity (app interactions, in-app search history)** | Yes | Yes — PostHog | Analytics | Product analytics + session recording (`components/posthog-provider.tsx`); session replay is content-masked (all inputs/text masked) |
| **Device or other IDs** | Yes | Yes — Firebase/FCM | App functionality | Push notification device tokens |
| **Audio** | Yes | Yes — AI Gateway (Whisper) | App functionality | Voice input for Search/Ask, transcribed server-side, not stored as audio afterward |

**Data deletion**: `/settings/delete-account` provides a real, working in-app account deletion flow — check the box in Play Console's Data Safety form saying you support this.

**Encryption in transit**: Yes (Supabase/Vercel/Stripe/Plaid all HTTPS-only).

**Is data collection required or optional?** Account creation (email) is required; bank linking, AI-assisted capture (photos), voice input, and location are each opt-in per feature.

## Content rating questionnaire

No user-generated content moderation concerns (household-private data, not a public social product), no violence/mature content, no gambling. Should land in the lowest content rating tier (Everyone) on IARC — answer the standard questionnaire honestly, nothing here needs special handling.

## App content declarations

- **Target audience**: not designed for children; standard "13+" / general audience track (household finance/inventory management is an adult use case).
- **Ads**: none.
- **In-app purchases**: subscriptions exist (Stripe-billed) but purchasing is **not initiated from within the native app** — see `docs/Mobile App Addendum.md` and the native `Capacitor.isNativePlatform()` gate in `settings/billing/page.tsx`/`upgrade-dialog.tsx`/`email-receipts/page.tsx`. Answer "No" to in-app purchases in Play Console's declaration, consistent with that gate.
- **Government app / news app / COVID app**: No to all.
