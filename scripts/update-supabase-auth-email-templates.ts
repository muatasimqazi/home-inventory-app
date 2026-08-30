/**
 * Updates the hosted Supabase Auth email templates to the checked-in
 * Schuaz-branded HTML templates.
 *
 * Requires a Supabase personal access token from:
 * https://supabase.com/dashboard/account/tokens
 *
 * Usage:
 * SUPABASE_ACCESS_TOKEN=... pnpm dlx tsx scripts/update-supabase-auth-email-templates.ts
 */
import { readFile } from "node:fs/promises";

process.loadEnvFile(".env.local");

const API_URL = "https://api.supabase.com/v1";

interface TemplateConfig {
  enabledKey?: string;
  subjectKey: string;
  contentKey: string;
  subject: string;
  path: string;
}

const templates: TemplateConfig[] = [
  {
    subjectKey: "mailer_subjects_confirmation",
    contentKey: "mailer_templates_confirmation_content",
    subject: "Confirm your Schuaz email",
    path: "supabase/templates/auth/confirmation.html",
  },
  {
    subjectKey: "mailer_subjects_recovery",
    contentKey: "mailer_templates_recovery_content",
    subject: "Reset your Schuaz password",
    path: "supabase/templates/auth/recovery.html",
  },
  {
    subjectKey: "mailer_subjects_magic_link",
    contentKey: "mailer_templates_magic_link_content",
    subject: "Sign in to Schuaz",
    path: "supabase/templates/auth/magic-link.html",
  },
  {
    subjectKey: "mailer_subjects_invite",
    contentKey: "mailer_templates_invite_content",
    subject: "You are invited to Schuaz",
    path: "supabase/templates/auth/invite.html",
  },
  {
    subjectKey: "mailer_subjects_email_change",
    contentKey: "mailer_templates_email_change_content",
    subject: "Confirm your new Schuaz email",
    path: "supabase/templates/auth/email-change.html",
  },
  {
    subjectKey: "mailer_subjects_reauthentication",
    contentKey: "mailer_templates_reauthentication_content",
    subject: "Your Schuaz verification code",
    path: "supabase/templates/auth/reauthentication.html",
  },
  {
    enabledKey: "mailer_notifications_password_changed_enabled",
    subjectKey: "mailer_subjects_password_changed_notification",
    contentKey: "mailer_templates_password_changed_notification_content",
    subject: "Your Schuaz password was changed",
    path: "supabase/templates/auth/password-changed.html",
  },
  {
    enabledKey: "mailer_notifications_email_changed_enabled",
    subjectKey: "mailer_subjects_email_changed_notification",
    contentKey: "mailer_templates_email_changed_notification_content",
    subject: "Your Schuaz email was changed",
    path: "supabase/templates/auth/email-changed.html",
  },
] as const;

function projectRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url).host;
    const suffix = ".supabase.co";
    if (!host.endsWith(suffix)) return null;
    return host.slice(0, -suffix.length);
  } catch {
    return null;
  }
}

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF ?? projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

  if (!accessToken) throw new Error("SUPABASE_ACCESS_TOKEN must be set.");
  if (!projectRef) throw new Error("SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL must be set.");

  const payload: Record<string, string | boolean> = {};
  for (const template of templates) {
    if (template.enabledKey) payload[template.enabledKey] = true;
    payload[template.subjectKey] = template.subject;
    payload[template.contentKey] = await readFile(template.path, "utf8");
  }

  const response = await fetch(`${API_URL}/projects/${projectRef}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase Auth config update failed (${response.status}): ${body}`);
  }

  console.log(`Updated ${templates.length} Supabase Auth email templates for project ${projectRef}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
