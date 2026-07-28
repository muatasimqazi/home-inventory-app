# BUGS

Status legend: ✅ fixed and verified live · ⚠️ deferred (reason noted).
See `docs/v2-checklist.md` for the full technical writeups and how each
was verified.

1. ✅ toast.success(`Permanently deleted ${row.name}`); shows Permanently deleted unidentified small appliance
   Not a toast bug — a low-confidence AI-suggested name could be saved completely untouched. capture/review now blocks Save while any needs-review row's name still matches the raw AI suggestion, with an inline hint to confirm/edit it first.
2. ✅ You moved unidentified item
   Same root cause as #1 — fixed by the same change.
3. ✅ Item deleted on location detail page (/items/[id]) and then clicking delete permanntly shows 404 since the item detail no longer exists
   Real race: the delete removes the item from local state optimistically before navigation away finishes, and the page's 404 guard fired on that re-render. Now only a never-seen id 404s.
4. ✅ Toasts showing up at the top don't show up properly and seem hidden behind the heading
   The toaster's default offset landed inside the app's opaque sticky headers. Given an explicit safe-area-aware top offset.
5. ✅ Add manually form inputs don't have white background
   Added.
6. NFC issues
   - ✅ NFC writing options shows up on iphone even this doesn't support it — removed; Shortcuts is now the primary (not "fallback") path on iOS.
   - ✅ once nfc is written, no way to add more nfc tags or remove exsiting one — added a "Write a different tag" action that unlinks and returns to setup.
   - ✅ shareable link doesn't have the correct url of the website and takes to 404 page — added a real `/c/[token]` route plus a shared URL helper built from the actual deployed origin; a scan while signed out now lands back on the real bin after signing in instead of just "/".
   - ⚠️ Install Shohaz Shortcut doesn't do much other than change status of the bin having an nfc — **deferred**: a real installer needs an actual hosted `.shortcut` file/deep link, an asset not available in this environment.
   - ✅ Test scan says successful without an effect — now gated on real Web NFC (`NDEFReader`) availability, attempting an actual scan where supported instead of an unconditional success toast. Note: the *write* flow itself remains a deliberate simulation (unchanged) — real `NDEFWriter` hardware calls are also deferred, since there's no physical NFC device in this environment to verify against, and writing is higher-stakes to get wrong silently than reading.
7. ✅ Add container on location page shows the dialog but the iphone keyboard is infront of it
   Root layout now sets `interactiveWidget: "resizes-content"`, fixing every fixed-position bottom sheet in the app at once, not just this one.
8. ✅ Assign bin id has an example placeholder, instead it should have the generated one as filled in (e.g. OFF-001). Users should be able to edit if they want
   The sheet now opens pre-filled with the real next generated code, still fully editable.
9. ✅ Select photo takes to phone camera app instead of giving option to choose photos
   Root-caused to the missing item cover-photo feature (see #11) — there was no "choose an existing photo" entry point anywhere except the full-screen camera capture flow. Fixed by #11's real photo picker (a plain file input with no `capture` attribute).
10. ✅ Users/Members have no way to update their names
    Not just missing UI — no RLS policy let a member update even their own row. Added a scoped self-update policy, a store action, and a tappable profile row in Settings.
11. ✅ Items photos are not getting saved to supabase, only shows emoji, which sould be a fallback or users should be able to choose what they want to show as image
    Genuinely missing feature, not a save bug — no schema/storage existed for a real item photo at all; the captured photo was thrown away after AI detection. Added a real column + a public Storage bucket, upload/remove actions, and pickers in the manual-add flow, item detail page, and an auto-attach from capture when there's exactly one photo in the session. Emoji remains the fallback when no photo is set, as requested.
12. ✅ Users should have an option to show bins and items in a bin in a nice table format consistent with our exisiting ui, such as the settings page showing rows
    Added a grid/list toggle on location and container detail pages, reusing an already-built-but-unwired row component for bins and a new one for items (kept the real photo thumbnail there, unlike the generic-icon row style).
13. ✅ Search functionlity is not reliable
    Token matching was OR-based, so a multi-word query like "red mug" surfaced anything containing just one of the words. Now requires every query word to match somewhere before a row is included at all.
