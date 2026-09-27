import { BackButton } from "@/components/back-button";

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-background px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10 text-ink">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        {/* router.back() — reached from both Settings (signed in) and the
            sign-in page's footer (signed out), so this correctly returns
            to whichever it actually was, unlike the fixed "/" link this
            replaced (which took a signed-in user reading this from
            Settings to the public marketing page instead of back into
            their own session — reported live as "no way to get back to
            app"). */}
        <header className="flex flex-col gap-3">
          <BackButton />
          <div>
            <h1 className="text-screen-title font-semibold">Privacy Policy</h1>
            <p className="mt-2 text-caption text-muted-foreground">Last updated: September 27, 2026</p>
          </div>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">Overview</h2>
          <p className="text-body text-muted-foreground">
            Schuaz helps households catalog belongings, manage household data, and track personal finance information. This policy explains what
            information the app collects, how it is used, and the choices available to you.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">Information We Collect</h2>
          <ul className="list-disc space-y-2 pl-5 text-body text-muted-foreground">
            <li>Account details, such as your email address, sign-in provider, profile name, and household membership.</li>
            <li>Inventory content you add, including item names, locations, containers, notes, photos, labels, tags, and generated images.</li>
            <li>Finance content you add or connect, including accounts, balances, transactions, categories, receipts, statement uploads, and Plaid-linked data.</li>
            <li>Household activity, settings, notification preferences, API keys, and audit events needed to operate the app.</li>
            <li>Technical information such as device/browser details, logs, errors, and security metadata used to keep the service reliable.</li>
            <li>Usage and analytics information, such as pages viewed, features used, and interactions within the app (see Analytics below).</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">How We Use Information</h2>
          <ul className="list-disc space-y-2 pl-5 text-body text-muted-foreground">
            <li>To provide the app, sync household data, show search results, generate reminders, and keep records associated with the correct household.</li>
            <li>To process photos, receipts, statements, and other uploads using AI or automation features you choose to use.</li>
            <li>To send account, security, receipt, reminder, and notification messages when enabled.</li>
            <li>To debug, secure, maintain, and improve the service.</li>
            <li>To understand how the app is used, measure traffic, and decide what to improve.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">Service Providers</h2>
          <p className="text-body text-muted-foreground">
            Schuaz uses third-party services to host the app, store data, authenticate users, process payments and bank connections, send email,
            deliver notifications, measure usage, and run AI features. These providers may process information only as needed to provide those services. Current
            categories include hosting, database/storage, authentication, Plaid bank connectivity, Resend email handling, Vercel AI Gateway, AI
            model providers used by selected features, and PostHog and Google Analytics for product analytics.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">Analytics</h2>
          <p className="text-body text-muted-foreground">
            Schuaz uses two analytics services, on the website and inside the iOS and Android apps.
          </p>
          <ul className="list-disc space-y-2 pl-5 text-body text-muted-foreground">
            <li>
              PostHog records product usage and session replays so we can find bugs and improve the app. When you are signed in, this activity is
              associated with your account ID and email address. Session replays mask all text and form inputs, so the contents of your inventory,
              finances, and notes are not captured.
            </li>
            <li>
              Google Analytics measures traffic and usage, such as pages viewed, device and browser type, and approximate location derived from your
              IP address. It uses cookies or similar identifiers to recognize repeat visits. We do not send your name, email address, or household
              data to Google Analytics. Google&apos;s use of this data is described in{" "}
              <a href="https://policies.google.com/technologies/partner-sites" className="font-medium text-yellow-text underline">
                How Google uses information from sites or apps that use its services
              </a>
              .
            </li>
          </ul>
          <p className="text-body text-muted-foreground">Schuaz does not show ads.</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">Sharing</h2>
          <p className="text-body text-muted-foreground">
            Household inventory data is visible to members of that household. Finance data can include personal accounts and shared accounts based on
            the sharing settings available in the app. We do not sell your personal information.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">Your Choices</h2>
          <ul className="list-disc space-y-2 pl-5 text-body text-muted-foreground">
            <li>You can update or delete many records in the app.</li>
            <li>You can disable push notifications in app settings or your browser/OS settings.</li>
            <li>You can disconnect bank accounts where supported by the app and Plaid.</li>
            <li>You can request account deletion from Settings.</li>
            <li>
              On the web, you can block analytics cookies in your browser settings or install the{" "}
              <a href="https://tools.google.com/dlpage/gaoptout" className="font-medium text-yellow-text underline">
                Google Analytics opt-out browser add-on
              </a>
              .
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">Contact</h2>
          <p className="text-body text-muted-foreground">
            For privacy questions, email{" "}
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
