import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { performAddSubtaskToTask, performCreateNote, performCreateTask } from "@/lib/ask/tools";

export const runtime = "nodejs";

// Executes a Notes/Tasks write the Ask assistant only *proposed* earlier
// (lib/ask/tools.ts's createNote/createTask/addSubtaskToTask, called via
// POST /api/v1/ask) — nothing is actually saved until the user taps
// Confirm on the resulting pending-action card and this route runs. Same
// session-cookie auth as /api/v1/ask; RLS on notes/household_tasks/
// task_subtasks scopes the actual write to what the confirming user can
// really do, same as every direct client-side create already relies on.
// This route re-validates the payload shape itself rather than trusting
// whatever the client echoes back — the client only ever gets a payload
// by round-tripping one this same server handed it moments earlier, but
// there's no reason to skip the same type checks /api/v1/ask itself does.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { householdId, kind, payload } = (body ?? {}) as { householdId?: unknown; kind?: unknown; payload?: unknown };
  if (typeof householdId !== "string" || !householdId) {
    return NextResponse.json({ error: "`householdId` is required." }, { status: 400 });
  }
  if (kind !== "createNote" && kind !== "createTask" && kind !== "addSubtaskToTask") {
    return NextResponse.json({ error: "Unknown action kind." }, { status: 400 });
  }
  const p = (payload ?? {}) as Record<string, unknown>;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    if (kind === "createNote") {
      if (typeof p.title !== "string" || typeof p.content !== "string") {
        return NextResponse.json({ error: "Invalid payload for createNote." }, { status: 400 });
      }
      const result = await performCreateNote(supabase, householdId, user.id, { title: p.title, content: p.content, isShared: p.isShared === true });
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });
      return NextResponse.json({
        reference: { kind: "note", id: result.id, title: result.title, subtitle: "Just created", imageUrl: null, href: `/notes/${result.id}` },
      });
    }

    if (kind === "createTask") {
      if (typeof p.title !== "string" || typeof p.dueAt !== "string") {
        return NextResponse.json({ error: "Invalid payload for createTask." }, { status: 400 });
      }
      const result = await performCreateTask(supabase, householdId, user.id, {
        title: p.title,
        description: typeof p.description === "string" ? p.description : "",
        dueAt: p.dueAt,
        category: typeof p.category === "string" ? p.category : "Other",
      });
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });
      return NextResponse.json({
        reference: { kind: "task", id: result.id, title: result.title, subtitle: `Due ${result.dueAt.slice(0, 10)}`, imageUrl: null, href: `/tasks/${result.id}` },
      });
    }

    // kind === "addSubtaskToTask"
    if (typeof p.taskId !== "string" || typeof p.subtaskTitle !== "string") {
      return NextResponse.json({ error: "Invalid payload for addSubtaskToTask." }, { status: 400 });
    }
    const result = await performAddSubtaskToTask(supabase, { householdId, taskId: p.taskId, subtaskTitle: p.subtaskTitle });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });
    // taskTitle isn't returned by performAddSubtaskToTask (task_subtasks
    // has no title column to look it back up from) — the client already
    // has it from the pendingAction it's confirming, so it's echoed
    // straight back from the request payload instead of a second query.
    const taskTitle = typeof p.taskTitle === "string" ? p.taskTitle : "Task";
    return NextResponse.json({
      reference: { kind: "task", id: result.taskId, title: taskTitle, subtitle: `Added "${result.subtaskTitle}"`, imageUrl: null, href: `/tasks/${result.taskId}` },
    });
  } catch (error) {
    console.error("Ask confirm failed:", error);
    return NextResponse.json({ error: "Couldn't complete that action. Please try again.", retryable: true }, { status: 502 });
  }
}
