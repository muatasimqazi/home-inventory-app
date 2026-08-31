import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-background px-6 py-10 text-ink">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <Link href="/" className="text-caption font-medium text-muted-foreground">
            Schuaz
          </Link>
          <div>
            <h1 className="text-screen-title font-semibold">Terms of Service</h1>
            <p className="mt-2 text-caption text-muted-foreground">Last updated: August 30, 2026</p>
          </div>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">Using Schuaz</h2>
          <p className="text-body text-muted-foreground">
            Schuaz is a household inventory and finance tool. By using it, you agree to use the service lawfully, keep your account credentials safe,
            and only upload information you have the right to store and process.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">Your Content</h2>
          <p className="text-body text-muted-foreground">
            You retain ownership of the content you add to Schuaz. You grant the app permission to store, process, display, transmit, and transform
            that content as needed to provide features such as search, photo processing, receipt extraction, bank syncing, reminders, exports, and
            household sharing.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">Households and Sharing</h2>
          <p className="text-body text-muted-foreground">
            Household members may be able to view, edit, or delete shared household records. Finance data may have additional account-level sharing
            controls. You are responsible for choosing who belongs in your household and what information you share.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">AI and Automation</h2>
          <p className="text-body text-muted-foreground">
            AI-generated names, categories, receipt data, statement data, product photos, background removal, and matching suggestions may be wrong.
            Review important results before relying on them, especially for financial, warranty, insurance, resale, or safety decisions.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">Finance Features</h2>
          <p className="text-body text-muted-foreground">
            Schuaz is not a bank, broker, tax advisor, financial advisor, or accounting firm. Finance features are for organization and recordkeeping
            only. Verify balances, transactions, budgets, and recurring bills against your financial institutions before making decisions.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">Availability</h2>
          <p className="text-body text-muted-foreground">
            The service may change, pause, or stop at any time. Features can fail or be unavailable because of network issues, third-party services,
            browser limitations, device permissions, or maintenance.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">Account Deletion</h2>
          <p className="text-body text-muted-foreground">
            You can request deletion from Settings. Some records may remain where needed for security, debugging, legal compliance, backups, or
            household records controlled by another member.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">Contact</h2>
          <p className="text-body text-muted-foreground">
            For questions about these terms, email{" "}
            <a href="mailto:info@schuaz.com" className="font-medium text-yellow-text underline">
              info@schuaz.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
