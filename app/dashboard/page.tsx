import { logoutAction } from "@/app/actions/auth";
import { DashboardPreview, OfficeShell } from "@/app/components/OfficePreview";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  return <OfficeShell email={user.email} logoutAction={logoutAction} active="dashboard"><DashboardPreview /></OfficeShell>;
}
