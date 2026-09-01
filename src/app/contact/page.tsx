import Link from "next/link";

export default function ContactPage() {
  return (
    <main className="min-h-dvh bg-background px-6 py-10 text-ink">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <Link href="/" className="text-caption font-medium text-muted-foreground">
            Schuaz
          </Link>
          <div>
            <h1 className="text-screen-title font-semibold">Contact Us</h1>
            <p className="mt-2 text-caption text-muted-foreground">Reach the Schuaz operator directly — there&rsquo;s no support team, just one person reading this inbox.</p>
          </div>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">Email</h2>
          <p className="text-body text-muted-foreground">
            <a href="mailto:info@schuaz.com" className="font-medium text-yellow-text underline">
              info@schuaz.com
            </a>{" "}
            — for bugs, feature requests, billing questions, privacy/data requests, or anything else about the app. Expect a reply within a few
            days, not instantly.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">Reporting a Bug</h2>
          <p className="text-body text-muted-foreground">A faster fix usually needs less back-and-forth up front. If you can, include:</p>
          <ul className="list-disc space-y-2 pl-5 text-body text-muted-foreground">
            <li>What you were trying to do, and what happened instead.</li>
            <li>A screenshot or screen recording, if it&rsquo;s visual.</li>
            <li>Whether it happens every time or only sometimes.</li>
            <li>Your device and browser (or &ldquo;installed app&rdquo; if you added it to your home screen).</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">Account &amp; Billing</h2>
          <p className="text-body text-muted-foreground">
            Manage your subscription from <span className="font-medium text-ink">Settings → Billing</span> inside the app. For anything Billing
            doesn&rsquo;t cover — a refund, a charge you don&rsquo;t recognize, switching plans manually — email the address above.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">Data &amp; Privacy Requests</h2>
          <p className="text-body text-muted-foreground">
            Export your data from <span className="font-medium text-ink">Settings → Data &amp; Export</span>, or delete your account entirely from{" "}
            <span className="font-medium text-ink">Settings → Delete Account</span>. For anything else — correcting, restricting, or asking what&rsquo;s
            stored — email the address above. See the{" "}
            <Link href="/privacy" className="font-medium text-yellow-text underline">
              Privacy Policy
            </Link>{" "}
            for the full picture of what&rsquo;s collected and why.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium">More</h2>
          <p className="text-body text-muted-foreground">
            <Link href="/privacy" className="font-medium text-yellow-text underline">
              Privacy Policy
            </Link>{" "}
            ·{" "}
            <Link href="/terms" className="font-medium text-yellow-text underline">
              Terms of Service
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
