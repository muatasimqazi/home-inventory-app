import { notFound, redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// What every NFC tag/QR label actually resolves to (see lib/urls.ts) —
// previously this route didn't exist at all, so every scan hit Next's
// default 404. Looks up the container by its tag_token and redirects to
// its real detail page. RLS on `containers` already restricts this to
// households the signed-in user (the proxy requires one for this path)
// actually belongs to — a token for a container in a household they're
// not a member of resolves to nothing, same as an unknown token.
export default async function ResolveTagPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.from("containers").select("id").eq("tag_token", token).maybeSingle();
  if (!data) notFound();
  redirect(`/containers/${data.id}`);
}
