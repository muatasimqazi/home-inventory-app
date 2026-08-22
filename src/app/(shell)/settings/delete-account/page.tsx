"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInventoryStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const CONFIRMATION_PHRASE = "DELETE";

interface HouseholdRef {
  id: string;
  name: string;
}

interface Preview {
  blocked: HouseholdRef[];
  willBeDeleted: HouseholdRef[];
  willBeLeft: HouseholdRef[];
}

/**
 * Account deletion (Workstream 6). Deliberately its own page, not a
 * dialog off the main Settings screen — this is the one action in the
 * product more destructive than "Delete Forever" (which only ever touches
 * one item/container/location the person already put in Trash), so it
 * gets its own confirmation ladder: a real, specific preview of what's
 * about to happen (fetched from the server, never guessed at client-side)
 * before the destructive button is even reachable, then a typed
 * confirmation phrase — stronger than ConfirmDialog's plain Confirm/Cancel
 * (the strongest pattern that existed before this) — before it fires.
 */
export default function DeleteAccountPage() {
  const router = useRouter();
  const currentUserEmail = useInventoryStore((s) => s.currentUserEmail);

  const [preview, setPreview] = useState<Preview | "loading" | "error">("loading");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [phraseInput, setPhraseInput] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/account/delete");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setPreview("error");
          return;
        }
        setPreview(data);
      } catch {
        if (!cancelled) setPreview("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isBlocked = preview !== "loading" && preview !== "error" && preview.blocked.length > 0;

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch("/api/v1/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: phraseInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't delete your account.");
        return;
      }
      if (data.signInRemoved === false) {
        // Partial outcome, not a failure to hide — see the route's own
        // comment for exactly why this can happen (shared activity
        // history in a still-active household).
        toast.success(data.message, { duration: 10000 });
      } else {
        toast.success("Your account has been deleted.");
      }
      useInventoryStore.getState().unsubscribeRealtime();
      await getSupabaseBrowserClient().auth.signOut();
      router.push("/sign-in");
    } catch {
      toast.error("Couldn't delete your account.");
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-screen-title font-semibold text-ink">Delete Account</h1>
        <p className="mt-0.5 text-caption text-muted-foreground">Permanently delete your account and everything you own.</p>
      </div>

      {preview === "loading" && (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-white p-8 shadow-sm">
          <Icon name="spinner" size={20} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {preview === "error" && (
        <div className="rounded-2xl border border-border bg-white p-4 text-body text-muted-foreground shadow-sm">
          Couldn&apos;t load your account details. Try again in a moment.
        </div>
      )}

      {preview !== "loading" && preview !== "error" && (
        <>
          {isBlocked && (
            <div className="flex flex-col gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
                  <Icon name="danger" size={18} />
                </div>
                <div>
                  <p className="text-body font-medium text-ink">Transfer ownership first</p>
                  <p className="mt-0.5 text-caption text-muted-foreground">
                    You&apos;re the Owner of {preview.blocked.length === 1 ? "a household" : "households"} with other members —{" "}
                    {preview.blocked.map((h) => `"${h.name}"`).join(", ")}. Transfer ownership to another member there before you can
                    delete your account.
                  </p>
                </div>
              </div>
              <Link href="/settings/members" className="self-start text-caption font-medium text-ink underline underline-offset-2">
                Go to People →
              </Link>
            </div>
          )}

          {!isBlocked && (
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
              <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">This will</p>

              {preview.willBeDeleted.length > 0 && (
                <div className="flex items-start gap-3">
                  <Icon name="trash" size={16} className="mt-0.5 shrink-0 text-danger" />
                  <p className="text-body text-ink">
                    Permanently delete{" "}
                    {preview.willBeDeleted.map((h, i) => (
                      <span key={h.id} className="font-medium">
                        {i > 0 ? ", " : ""}
                        {h.name}
                      </span>
                    ))}{" "}
                    — every item, transaction, account, location, container, and attachment in{" "}
                    {preview.willBeDeleted.length === 1 ? "it" : "them"}. You&apos;re the only member, so nothing else is affected.
                  </p>
                </div>
              )}

              {preview.willBeLeft.length > 0 && (
                <div className="flex items-start gap-3">
                  <Icon name="users" size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <p className="text-body text-ink">
                    Remove you from{" "}
                    {preview.willBeLeft.map((h, i) => (
                      <span key={h.id} className="font-medium">
                        {i > 0 ? ", " : ""}
                        {h.name}
                      </span>
                    ))}{" "}
                    and delete any items you personally own there. Shared transactions, accounts, locations, and anything else other
                    members rely on stays untouched.
                  </p>
                </div>
              )}

              {preview.willBeDeleted.length === 0 && preview.willBeLeft.length === 0 && (
                <p className="text-body text-muted-foreground">You&apos;re not a member of any household — only your sign-in will be removed.</p>
              )}

              <div className="flex items-start gap-3 border-t border-border pt-3">
                <Icon name="logOut" size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                <p className="text-body text-ink">Delete your sign-in ({currentUserEmail}). This cannot be undone.</p>
              </div>
            </div>
          )}

          <Button
            size="lg"
            variant="destructive"
            disabled={isBlocked}
            onClick={() => {
              setPhraseInput("");
              setConfirmOpen(true);
            }}
          >
            <Icon name="trash" size={16} /> Delete my account
          </Button>
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={(open) => !deleting && setConfirmOpen(open)}>
        <DialogContent className="rounded-xl sm:max-w-sm">
          <DialogHeader>
            <div className="flex size-11 items-center justify-center rounded-full bg-danger/10 text-danger">
              <Icon name="danger" size={20} />
            </div>
            <DialogTitle className="text-section-title font-medium text-ink">Are you absolutely sure?</DialogTitle>
            <DialogDescription className="text-body text-muted-foreground">
              This permanently deletes your account and cannot be undone. Type <span className="font-mono font-semibold text-ink">{CONFIRMATION_PHRASE}</span> to
              confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={phraseInput}
            onChange={(e) => setPhraseInput(e.target.value)}
            placeholder={CONFIRMATION_PHRASE}
            className="h-11 font-mono"
            autoFocus
            disabled={deleting}
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" size="lg" className="flex-auto" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              size="lg"
              variant="destructive"
              className="flex-auto"
              disabled={deleting || phraseInput !== CONFIRMATION_PHRASE}
              onClick={handleDelete}
            >
              {deleting ? <Icon name="spinner" size={16} className="animate-spin" /> : "Delete my account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
