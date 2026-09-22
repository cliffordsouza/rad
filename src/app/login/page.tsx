import { redirect } from "next/navigation";
import { getUser, allowedDomain } from "@/lib/session";
import LoginForm from "./LoginForm";

const ERRORS: Record<string, string> = {
  domain: "That account isn't on the allowed email domain.",
  no_access: "That account has no RAD access yet. Ask an admin to add you.",
  google_not_configured: "Google sign-in isn't configured yet - use dev sign-in for now.",
  no_code: "Sign-in was cancelled.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getUser();
  if (user) redirect("/portal");
  const { error } = await searchParams;

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="rad-card rad-rise" style={{ width: "100%", maxWidth: 380, padding: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <img src="/brand/rad-avatar.png" alt="RAD" width={44} height={44} style={{ borderRadius: 11 }} />
          <h1 style={{ margin: 0, fontSize: 24 }}>RAD Portal</h1>
        </div>
        <p style={{ color: "var(--muted)", marginTop: 0, marginBottom: 24, fontSize: 14 }}>
          Sign in to manage RAD - notifications, polls and access.
        </p>
        {error && ERRORS[error] && (
          <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 16 }}>{ERRORS[error]}</div>
        )}
        <LoginForm devAuth={process.env.RAD_DEV_AUTH === "1"} domain={allowedDomain()} />
      </div>
    </main>
  );
}
