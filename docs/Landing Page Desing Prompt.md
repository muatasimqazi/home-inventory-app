You are a senior product designer, conversion-focused UX designer, brand strategist, and frontend architect.

I need you to redesign the public landing page for an existing consumer web application.

[CORRECTED PREMISE — verified against the actual codebase: there is no existing public pricing page. Pricing today lives only inside the authenticated Settings → Billing screen (Stripe-backed tiers). This isn't "rebalance an existing page that over-indexes on pricing" — it's "build the landing page for the first time, including a new public pricing section pulled from the real tier data." Adjust §12 and the DELIVERABLE instructions accordingly.]

The website currently has only a bare, minimal placeholder page. We need a proper product landing page that communicates the product's value first, demonstrates what it can do, and then leads users naturally toward pricing.

PRODUCT CONTEXT

We are building an AI-powered application for managing everyday household life.

The product has expanded beyond a traditional home inventory app. It currently includes:

Home Inventory

Users can photograph storage bins, shelves, drawers, closets, rooms, or groups of belongings.

AI identifies the visible objects and helps catalog them.

Users can organize belongings by:

* Home
* Room
* Location
* Container/bin
* Category
* Household member

The goal is that users can later ask:

“Where is my drill?”

and receive something like:

“Garage → Shelf 2 → Blue Bin”

Personal Finance

Users can track household finances, including:

* financial accounts — connected automatically via real bank sync (Plaid), not just manual entry
* transactions
* spending
* categories
* budgets/financial insights
* receipts — photograph one and it's scanned and itemized automatically (real, shipped — the same AI-capture pipeline the Inventory side uses)

[CORRECTED — the original draft framed the purchase↔possession link as "long term." It's real and shipped today, not a future goal:]

Purchases already connect to actual household possessions, right now:

Best Buy transaction
→ Samsung TV
→ $1,299
→ Living Room
→ Household
→ Receipt
→ Warranty status ("is this still under warranty?")

This is one of the more technically distinctive things in the product — worth more prominence than a single example line, not less.

Household Members

A household can contain multiple people.

People do NOT necessarily need application accounts.

For example, parents can create managed profiles for children and associate belongings, clothing, expenses, etc. with them.

Items can belong to:

* Household
* Individual person
* Multiple people

[REMOVED — Food & Meal Planning. Verified against the codebase: this does not exist in any form (no ingredient recognition, no meal suggestions, nothing). The original draft gave this its own full marketing section (old §7) and multiple headline/example slots. Do not design around it — it would directly violate this document's own closing rule ("do not invent product functionality that does not exist"). If meal planning becomes real functionality later, it can get a section then.]

Weather (real, shipped — not in the original draft)

The household sets a home location once. The app shows a daily weather summary on the Overview page, and can proactively suggest what to prepare for — real examples already working today: "bring an umbrella," "bundle up, it's below freezing," "stay hydrated, it's hot."

Ask can already answer things like "what's the weather today" or "what should I wear" directly, using this same real data — not a future/conceptual capability, something built and live now.

This is a stronger fit than meal planning for the "small, delightful, AI quietly doing something useful" hook the original draft wanted — it's real, it's daily-use, and it demonstrates the household-knowledge thesis (the app knows where you live, so it can help) without inventing anything.

Wardrobe

Users can create a visual wardrobe using studio-like photos of their clothing.

The wardrobe experience can help users:

* visually browse clothing
* organize clothes
* associate clothing with household members
* potentially create outfits
* understand what they already own

The experience should feel visual and premium rather than like a spreadsheet of clothing records.

Notes

Users can maintain household notes.

Notes can eventually be associated with things in the household.

Examples:

“Living room paint is Benjamin Moore White Dove.”

“Garage door contractor: …”

“Measurements for bedroom curtains…”

Tasks

Users can manage household tasks and things that need to get done.

Examples:

* Replace HVAC filter
* Buy diapers
* Organize garage
* Return Amazon package
* Schedule appliance repair

[SOFTENED — the original draft implied this is close to current behavior. It isn't: the database supports linking a task to an item/person, but there's no picker UI for it yet, so this is a real direction, not a current capability. Market tasks today as a well-organized, household-shared list (with real recurring reminders and push notifications), not as already "contextual."]

Long term, tasks should be contextual and connected to household entities rather than functioning as a generic standalone todo application.

⸻

PRODUCT DIRECTION

The product should NOT be marketed as:

“Inventory + finance + wardrobe + weather + notes + tasks.”

That sounds like unrelated applications bundled together.

The underlying product thesis is:

One intelligent place for everyday household life.

Another concept we are exploring is:

Know your home. Run your household.

The application gradually builds knowledge about:

* what the household owns
* where things are
* who they belong to
* what the household spends
* what food is available
* what needs to be done
* what needs to be remembered

AI makes this household information searchable and useful.

Our longer-term internal vision is:

Build the knowledge layer for the household.

Users can already do this today — "Ask your home anything" isn't a future promise, it's a real, shipped feature (with voice input/output — speak the question, hear the answer spoken back, also real and shipped).

[CORRECTED examples — checked each one against the real Ask AI tools. Two of the original seven don't work today and were replaced:]

“Where are the batteries?” — real (inventory search with real location/container)

“How much did we spend at Costco last month?” — real (real transaction data, not an estimate)

“What tasks are due this week?” — real

“When did we buy the TV?” — real (purchase history, including warranty status)

“What's the weather today? What should I wear?” — real (replaces "what can I make tonight," which doesn't exist)

“Is my [item] still under warranty?” — real (replaces "show me Sarah's winter clothes," which Ask can't answer yet — wardrobe browsing exists as a UI, but no Ask tool searches it)

“What size furnace filter do we use?” — only real if it's actually saved somewhere (a note, an item detail) — a good example of the "remember what matters" pitch, but don't imply the app already knows random household facts nobody entered.

However, do NOT overpromise functionality that isn’t currently available.

⸻

YOUR OBJECTIVE

Design a landing page that makes a visitor understand the product within approximately 5–10 seconds.

The visitor should understand:

1. This is for managing their household.
2. AI makes organizing household information much easier.
3. It brings several parts of household life together.
4. It provides practical everyday value.
5. There is a reason to create an account/pay for it.

Do not make the page feel like enterprise SaaS.

This is a consumer household product.

The experience should feel:

* warm
* modern
* intelligent
* visual
* trustworthy
* calm
* premium
* approachable

Avoid excessive futuristic AI imagery.

Avoid generic stock photography wherever possible.

Prefer actual product UI, household imagery, photography, and visual demonstrations of the product working.

⸻

LANDING PAGE STRUCTURE

You may improve this structure if you have a stronger recommendation, but begin by considering the following.

1. Navigation

Keep navigation minimal.

Potential elements:

Logo

Product / Features

Pricing

Sign In

Primary CTA:
Get Started

Avoid a complicated enterprise navigation menu.

⸻

2. HERO

This is the most important section.

Develop several possible headline directions before selecting the strongest one.

Explore concepts such as:

Know your home. Run your household.

Your household, all in one place.

A smarter way to run your home.

Everything your household needs to remember.

Do not automatically use these. Improve them if possible.

The supporting copy should explain the product without listing every feature.

Potential concept:

“Keep your belongings, money, wardrobe, notes and tasks organized together—with AI doing the heavy lifting.”

But refine this significantly if possible.

Primary CTA:

Get Started

Secondary CTA could be:

See how it works

The hero should visually demonstrate the product.

Instead of a generic dashboard screenshot, consider a composition showing several connected household experiences.

For example:

CENTER:
Main application/home dashboard

SURROUNDING UI CARDS:

“Where’s my drill?”
Garage → Shelf 2 → Blue Bin

[REPLACED — "What can I make tonight?" was a meal-planning card; that feature doesn't exist. Real replacement:]

“What should I wear today?”
62° · Overcast · bring a light jacket

“Spending this month”
$X,XXX

“Today’s tasks”
3 remaining

Wardrobe clothing imagery

The composition should visually communicate:

One household → many connected capabilities

without overwhelming the visitor.

⸻

3. SHOW THE PROBLEM

Communicate that household information is fragmented.

Possessions are in bins and closets.

Financial information is in banking apps.

Food is in the refrigerator.

Tasks are somewhere else.

Notes are somewhere else.

Nobody remembers where everything is.

Then introduce the product as the place where household knowledge comes together.

Keep this section concise and visual.

⸻

4. CORE VALUE PROPOSITION

Rather than presenting six unrelated feature cards, organize the product around user outcomes.

Explore a structure such as:

KNOW

Know what you have and where it is.

Inventory + wardrobe + household members.

PLAN

Know what to do next.

[CORRECTED — original was "Meals + tasks"; meal planning doesn't exist.]

Tasks + reminders, with a real heads-up on the day ahead (weather).

UNDERSTAND

Know where your household money goes.

Finances + purchases.

REMEMBER

Keep important household knowledge available.

Notes + eventually documents/history.

Feel free to propose a better framework.

The objective is to make the product feel cohesive.

⸻

5. AI INVENTORY DEMONSTRATION

This is one of the strongest visual features and should receive its own section.

Show the transformation:

PHOTO OF STORAGE BIN

↓

AI recognizes:

* HDMI cable
* USB-C charger
* batteries
* power adapter
* extension cord

↓

Saved to:

Garage → Shelf 2 → Blue Bin

↓

Later:

“Where are my batteries?”

Garage → Shelf 2 → Blue Bin

The visitor should understand this workflow almost without reading.

Suggested message:

Take a photo. We’ll organize what’s inside.

Again, improve the copy if possible.

⸻

6. HOUSEHOLD FINANCES

Show that finances are part of household management rather than a completely separate budgeting product.

Potential visual:

Monthly spending dashboard

Categories

Recent transactions

Household spending trend

Potential copy direction:

Understand what it costs to run your household.

Avoid presenting this as accounting software.

⸻

7. WEATHER & DAILY CONTEXT

[REPLACED — the original §7 was Food/Meals, a feature that doesn't exist and would violate this document's own "do not invent functionality" rule. Weather is real, shipped, and fits the same slot: a small, visual, daily-use demonstration of the app quietly knowing something useful about your household.]

Show the Overview page's weather line, then the kind of thing it enables:

62° · Overcast in [city]

↓

"Bring an umbrella" / "Below freezing — bundle up" / "It's hot — stay hydrated"

The experience should communicate:

The app already knows where you live → it can help with small things, automatically.

Keep this section brief and light — it's a supporting proof point for "the app knows your household," not a headline feature on its own. Don't oversell it into a weather-app pitch.

⸻

8. WARDROBE

This should be visually distinct.

Show polished studio-style clothing images organized into a visual wardrobe.

[ADDITIONAL CONTEXT — real, not in the original draft: this same AI studio-photo capability now also applies to general Inventory items, not just clothing (one generated studio photo per newly detected item). Worth a light callback in §5's Inventory demonstration too — reinforces "AI does the visual heavy lifting" as a product-wide trait, not a wardrobe-only trick.]

Potential messaging:

Your closet, beautifully organized.

Show that wardrobes can belong to individual household members.

Avoid presenting this like ecommerce.

It should feel personal, organized and visual.

⸻

9. NOTES + TASKS

Do not dedicate huge independent marketing sections to these.

Instead demonstrate that household knowledge can become actionable.

Example:

NOTE

“Living room paint:
Benjamin Moore White Dove”

TASK

“Replace HVAC filter
Due September 15”

Potential message:

Remember what matters. Get things done.

Show contextual notes/tasks rather than a generic notes editor or todo list.

⸻

10. HOUSEHOLD / FAMILY

Show that the application understands the household as shared.

Example:

Household

Alex
Jamie
Emma
Noah

Emma can be a managed child profile without an application account.

Show examples of belongings or wardrobe associated with household members.

Keep this section emotionally warm and simple.

Do NOT make account permissions the marketing story.

⸻

11. “ASK YOUR HOME”

This should be the strongest section — and unlike most "AI chat" landing-page demos, this one can be entirely real. Ask AI (including voice input/output) is shipped and working today across inventory, finance, tasks, notes, and weather. This section can honestly claim "try it," not just "imagine it."

Create a large conversational/search interface.

Headline concept:

Just ask.

[CORRECTED example queries — two of the original five don't work today (checked against the real Ask AI tools):]

“Where are the Christmas lights?” — real

“How much did we spend eating out last month?” — real

“What do I need to do this weekend?” — real

“What's the weather, and what should I wear?” — real (replaces "What can I make tonight?" — no meal planning exists)

“Is my [item] still under warranty?” — real (replaces "Show me Emma's winter clothes" — wardrobe browsing exists as a UI, but Ask can't search it yet)

Use this section to demonstrate how all the product areas already feel like one system — this is demonstrated capability, not aspiration.

If a future capability is still worth teasing here, clearly and visually distinguish it from the real, working examples above (e.g. a distinct "coming soon" treatment) — don't blend them into one undifferentiated list the way the original draft did.

⸻

12. PRICING

[CORRECTED — there is no existing public pricing page today; real tiers/prices live only in the authenticated Settings → Billing screen (Stripe-backed). This section is "design a new public pricing section using the real tier data," not "reorganize an existing pricing page."]

Real pricing tiers/logic already exist server-side (Stripe) — pull the actual tier names/prices/features from there rather than inventing numbers, but the public-facing presentation itself needs to be designed fresh.

Include pricing as an important conversion section but place it after visitors understand the product.

Pricing should feel like the natural next step rather than the entire landing page.

Highlight the recommended plan clearly.

Avoid manipulative pricing UX.

⸻

13. FINAL CTA

Finish with a simple emotional proposition.

Potential direction:

Your home already has a lot to keep track of. You shouldn’t have to remember it all.

Then:

Get Started

Explore better alternatives if appropriate.

⸻

DESIGN DIRECTION

Use a contemporary consumer application aesthetic.

Prioritize:

* generous whitespace
* strong typography
* subtle depth
* rounded cards where appropriate
* large product visuals
* restrained animation
* clean iconography
* excellent mobile responsiveness
* accessible contrast
* clear hierarchy

The page should feel more like a polished consumer product from Apple, Airbnb, Linear, Notion or modern fintech applications than a traditional property-management website.

Do NOT directly copy any company’s visual identity.

Avoid:

* excessive gradients
* glowing AI effects everywhere
* robot imagery
* generic AI sparkle icons everywhere
* huge walls of feature cards
* excessive text
* stock-photo families smiling at laptops
* generic SaaS illustrations
* complicated pricing tables near the top
* buzzwords such as “revolutionize,” “game-changing,” and “AI-powered ecosystem”

Use AI as an enabling technology, not the entire brand identity.

⸻

MOBILE

Design mobile intentionally rather than simply stacking desktop sections.

The hero should remain understandable without requiring the user to scroll through an enormous mockup.

Product demonstrations should work as swipeable/animated sequences where appropriate.

Primary CTAs should remain easy to reach.

Pricing must remain readable.

⸻

CONVERSION

Every major section should help answer one of these questions:

What is this?

Why do I need it?

How does it work?

Why is it better than what I do today?

Can I trust it with household/financial information?

How much does it cost?

How do I start?

Avoid adding sections simply because most SaaS landing pages have them.

⸻

IMPORTANT PRODUCT CONSTRAINT

Breadth is our biggest messaging risk.

Do not solve it by displaying every feature equally.

Create a clear hierarchy.

I currently believe the strongest visual hook is:

Photo → AI understands household items → everything becomes searchable

with finances, wardrobe, weather, notes and tasks demonstrating how much broader the household platform becomes.

Challenge this assumption if you believe another hierarchy would communicate the product more effectively.

⸻

DELIVERABLE

First, critique the proposed positioning and landing-page strategy.

Then provide:

1. Recommended primary value proposition
2. Recommended headline
3. Recommended subheadline
4. Primary and secondary CTAs
5. Complete landing-page information architecture
6. Purpose of every section
7. Final production-ready copy for every section
8. Detailed visual/layout direction for every section
9. Recommended product screenshots/mockups needed
10. Interaction and animation recommendations
11. Desktop behavior
12. Mobile behavior
13. Pricing placement and presentation
14. Trust/privacy messaging
15. SEO title and meta description
16. Open Graph/social sharing copy
17. Analytics events/conversion funnel to instrument

After presenting the plan, implement the landing page using the existing application’s design system and frontend stack.

IMPORTANT:

* Inspect the existing codebase before implementing.
* Reuse existing components, typography, colors, spacing tokens, buttons and pricing components wherever appropriate.
* Do not unnecessarily redesign authenticated application screens.
* Preserve existing pricing/business logic (real Stripe tiers/prices) — no existing public pricing *page* to preserve, but don't invent different numbers than what Settings → Billing actually charges.
* Ensure the page is production-quality and responsive.
* Do not use placeholder lorem ipsum.
* Do not invent product functionality that does not exist.
* If a feature shown in the design is not currently implemented, either omit it or clearly treat it as future functionality rather than implying that it is currently available.
* Do NOT add "Available on iOS/Android" badges or App Store/Play Store links. A native mobile app exists but has not shipped to either store yet — advertising it now would be false.
* Do mention voice input/output for Ask ("speak your question, hear the answer") — this is real and shipped, and reinforces the "Ask your home" section well.

Most importantly:

Do not design a page that merely explains our features. Design a page that makes someone want the product.