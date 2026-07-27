import { logoutAction } from "@/app/actions/auth";
import { LedgerPreview, OfficeShell } from "@/app/components/OfficePreview";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const user = await requireUser();
  return <OfficeShell email={user.email} logoutAction={logoutAction} active="ledger"><LedgerPreview /></OfficeShell>;
}
