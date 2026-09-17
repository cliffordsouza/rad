import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { PERMISSIONS } from "@/lib/store";
import Dashboard from "./Dashboard";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const perms = PERMISSIONS[user.role];
  return <Dashboard email={user.email} role={user.role} perms={perms} />;
}
