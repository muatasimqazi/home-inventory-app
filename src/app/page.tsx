import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-background px-6 py-8 text-ink">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-5xl flex-col">
        <nav className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={36} height={36} className="size-9 rounded-xl" />
            <span className="text-body font-semibold">Schuaz</span>
          </Link>
          <Link href="/sign-in" className="text-caption font-medium text-muted-foreground">
            Sign in
          </Link>
        </nav>

        <section className="flex flex-1 flex-col justify-center gap-8 py-14">
          <div className="flex max-w-2xl flex-col gap-5">
            <p className="text-caption font-medium text-yellow-text">Household inventory and finance</p>
            <h1 className="text-[clamp(2.5rem,7vw,5rem)] leading-[0.95] font-semibold tracking-normal text-ink">
              A private hub for household records.
            </h1>
            <p className="max-w-xl text-body text-muted-foreground">
              Schuaz helps households keep track of belongings, storage locations, receipts, reminders, and personal finance records in one
              organized app.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <h2 className="text-body font-medium">Inventory</h2>
              <p className="mt-2 text-caption text-muted-foreground">
                Add items with photos, organize them by location or container, print labels, and search later when you need to find something.
              </p>
            </section>
            <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <h2 className="text-body font-medium">Receipts and Finance</h2>
              <p className="mt-2 text-caption text-muted-foreground">
                Scan receipts, import transactions, connect bank accounts with Plaid, categorize spending, and review recurring bills.
              </p>
            </section>
            <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <h2 className="text-body font-medium">Household Access</h2>
              <p className="mt-2 text-caption text-muted-foreground">
                Google sign-in is used only to create and secure your account, keep your data associated with you, and let invited household members
                access shared records.
              </p>
            </section>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/sign-in?action=signup"
              className="tap-target inline-flex h-12 items-center justify-center rounded-2xl bg-yellow px-6 text-body font-medium text-white shadow-sm"
            >
              Register
            </Link>
            <Link
              href="/sign-in"
              className="tap-target inline-flex h-12 items-center justify-center rounded-2xl border border-border bg-white px-6 text-body font-medium text-ink shadow-sm"
            >
              Sign in
            </Link>
          </div>
        </section>

        <footer className="flex flex-wrap gap-x-4 gap-y-2 pb-2 text-micro text-muted-foreground">
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          <Link href="/terms" className="underline underline-offset-2">
            Terms
          </Link>
        </footer>
      </div>
    </main>
  );
}
