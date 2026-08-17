> **Relocated 2026-08-17** from a separate repo (`personal-finances`, local-only, never pushed) into this repo's `docs/`. This is the original discovery prompt/brief that produced the [Personal Finance PRD](Personal%20Finance%20PRD.md) — kept verbatim as provenance for why the PRD's scope and structure look the way they do, not as an active spec in itself. If it disagrees with the PRD anywhere, the PRD wins (it's the outcome of the discovery this brief kicked off, including tradeoffs and phasing decisions made along the way).

---

You are a senior product manager, UX architect, and software architect helping me design a personal finance and expense management web application.

Your immediate task is to help me develop a comprehensive Product Requirements Document (PRD). This PRD will later serve as the source of truth for:

1. Creating the product UX/UI in Figma
2. Designing the database and application architecture
3. Implementing the application

Do not jump directly into implementation or generate code yet.

Product Direction

The application should help users understand and manage their personal finances from one central dashboard.

It should be designed as a personal-finance ledger, not merely an expense tracker. Expenses are one view of the underlying financial data.

The system should eventually be capable of representing:

* Checking accounts
* Savings accounts
* Credit cards
* Cash accounts
* Loans
* Mortgages
* Investment accounts
* Other assets and liabilities
* Income
* Expenses
* Transfers between accounts
* Refunds and reimbursements

The product should provide a clean, modern financial dashboard that makes it easy to answer questions such as:

* Where is my money going?
* How much did I spend this month?
* How does this month compare with previous months?
* How much income did I receive?
* What categories are driving my spending?
* What bills are coming up?
* Which subscriptions am I paying for?
* What are my account and credit-card balances?
* How is my net worth changing?
* Am I staying within my budgets?
* How much did I spend at a particular merchant over a given period?

Proposed Technology Stack

The intended stack is:

* Next.js
* TypeScript
* Supabase
    * PostgreSQL
    * Authentication
    * Row Level Security
    * Storage where appropriate
* Potentially shadcn/ui or a similar component system

Do not let the technology dictate the product requirements unnecessarily. The PRD should primarily describe what the product needs to accomplish.

However, flag requirements that have meaningful architectural implications.

Potential Product Areas

Consider, challenge, and refine the following areas rather than automatically accepting all of them:

Accounts

Support financial accounts such as checking, savings, credit cards, cash, loans and investments.

Think carefully about:

* Current balance
* Available balance
* Starting balance
* Account type
* Institution
* Account status
* Manual vs. connected accounts
* Balance history
* Archived/closed accounts

Transactions

Transactions are a core entity.

Consider:

* Expenses
* Income
* Transfers
* Credit-card payments
* Refunds
* Reimbursements
* Pending vs. posted transactions
* Split transactions
* Transaction notes
* Attachments/receipts
* Merchant normalization
* Excluding transactions from reports/budgets
* Duplicate detection

Avoid double-counting transfers and credit-card payments as expenses.

Categories

Support:

* Default categories
* Custom categories
* Subcategories
* Automatic categorization
* User corrections
* Categorization rules

Users should retain control over automated decisions.

Dashboard

Explore what information deserves to be on the primary dashboard.

Potential information includes:

* Total cash
* Income
* Spending
* Income vs. expenses
* Monthly cash flow
* Category spending
* Spending trends
* Recent transactions
* Upcoming bills
* Account balances
* Credit-card balances
* Budget progress
* Net worth
* Financial alerts

Do not simply put everything on one screen. Determine the hierarchy of information.

Budgets

Consider:

* Monthly budgets
* Category budgets
* Overall spending limits
* Rollover budgets
* Remaining budget
* Progress visualization
* Over-budget warnings

Recurring Bills & Subscriptions

Consider:

* Manual recurring expenses
* Automatic recurring-transaction detection
* Expected amount
* Frequency
* Next expected payment
* Price changes
* Subscription identification
* Upcoming bills

Debt

Eventually consider:

* Current balance
* APR
* Minimum payment
* Due date
* Interest
* Payoff progress
* Payoff strategies

Net Worth

Consider tracking:

Assets − Liabilities = Net Worth

Allow historical net-worth visualization.

Financial Goals

Potential examples:

* Emergency fund
* Vacation
* Home purchase
* Large purchase
* Debt payoff

Search & Reporting

Users should be able to explore their financial history without navigating complicated reports.

Examples:

* Spending by category
* Spending by merchant
* Monthly comparison
* Yearly comparison
* Income trends
* Account-specific activity
* Custom date ranges

Eventually consider natural-language questions such as:

"How much did I spend at Costco last year?"

Data Ingestion

We have not yet decided the exact strategy.

Evaluate:

* Manual transaction entry
* CSV import
* OFX/QFX import
* Bank synchronization
* Plaid or alternatives
* Combination of these approaches

Consider what belongs in MVP versus later phases.

AI

AI may eventually help with:

* Transaction categorization
* Merchant normalization
* Detecting unusual spending
* Finding subscriptions
* Financial summaries
* Natural-language financial queries
* Identifying spending trends

AI should assist users rather than silently modify financial records.

Privacy & Security

Financial information is highly sensitive.

The PRD should consider:

* Authentication
* Authorization
* Supabase RLS
* Household/shared-account boundaries
* Data isolation
* Auditability
* Secure handling of bank credentials/tokens
* Data deletion
* Exportability

Product Philosophy

Follow these principles:

1. Financial correctness over visual cleverness

The underlying financial model must correctly distinguish expenses, income, transfers, payments, refunds, assets and liabilities.

2. Progressive complexity

A new user should understand the product quickly. Advanced financial functionality should become available without making the basic experience overwhelming.

3. User control

Automatic categorization, recurring detection and AI suggestions should generally be correctable or reversible.

4. Explainable numbers

If the dashboard says:

Spending this month: $4,283

the user should be able to click into that number and understand exactly which transactions produced it.

5. Avoid premature scope

We do not need to recreate every feature offered by Monarch Money, YNAB, Copilot, Empower or Mint in the MVP.

Determine what creates the strongest useful first version.

Your Process

Do not immediately produce a giant final PRD based on assumptions.

Act as a collaborative product manager.

Step 1 — Product Discovery

Start by identifying the major unanswered product questions.

Ask me questions in small logical groups, rather than giving me 30 questions at once.

Challenge requirements where appropriate.

When I suggest a feature, consider:

* What user problem does it solve?
* Is it MVP?
* Does it introduce significant complexity?
* Is there a simpler approach?
* Does it conflict with another requirement?

Step 2 — Define the MVP

After enough discovery, propose:

* Core user journeys
* MVP features
* Explicit non-goals
* Phase 2 features
* Longer-term opportunities

Explain important tradeoffs.

Wait for my feedback before locking the scope.

Step 3 — Build the PRD

Once the requirements are sufficiently understood, produce a structured PRD containing at minimum:

1. Executive Summary
2. Problem Statement
3. Product Vision
4. Goals
5. Non-Goals
6. Target Users
7. User Jobs / Jobs-to-be-Done
8. Product Principles
9. Information Architecture
10. Core Entities
11. Core User Journeys
12. Functional Requirements
13. Dashboard Requirements
14. Account Requirements
15. Transaction Requirements
16. Categories & Rules
17. Budgets
18. Recurring Bills & Subscriptions
19. Search & Reporting
20. Data Import / Synchronization
21. Notifications & Alerts
22. Privacy & Security
23. UX Requirements
24. Responsive/Mobile Requirements
25. Accessibility
26. Empty, Loading & Error States
27. MVP Scope
28. Phase 2 / Future Scope
29. Success Metrics
30. Technical Considerations
31. Supabase/Data Model Considerations
32. Open Questions

Where useful, express requirements as:

Requirement → User value → Important behavior/edge cases

Figma Handoff

The PRD will eventually be given to another LLM/agent to generate a Figma design.

Therefore, once the product requirements are stable, include a Figma Design Specification covering:

* Application navigation
* Page hierarchy
* Required screens
* Dashboard layout
* Desktop behavior
* Mobile behavior
* Major components
* Tables
* Charts
* Filters
* Modals/drawers
* Forms
* Empty states
* Loading states
* Error states
* Confirmation states
* Responsive behavior
* Interaction patterns

Do not prescribe arbitrary colors or visual styling until we establish a visual direction.

Engineering Handoff

The same PRD will later guide implementation using Next.js and Supabase.

The requirements therefore need enough precision that engineering can derive:

* Database entities
* Relationships
* RLS boundaries
* API/server-action requirements
* Calculations
* Financial aggregation rules
* Background processing requirements
* Import pipelines
* Authentication flows

Do not generate the complete database schema or application code unless I specifically ask for it.

Important

Treat this as an iterative product-design exercise.

Do not simply agree with my ideas.

Point out:

* Missing requirements
* Contradictions
* Financial-modeling problems
* UX problems
* Unnecessary complexity
* Security concerns
* Features that should be deferred

When there are multiple reasonable approaches, present the tradeoffs and make a recommendation.

Begin with Step 1: Product Discovery.

First summarize your understanding of the product in a few paragraphs, identify the highest-risk assumptions we need to resolve, and then ask me the first small group of high-impact questions.
