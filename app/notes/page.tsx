import { logoutAction } from "@/app/actions/auth";
import { NotesPreview, OfficeShell } from "@/app/components/OfficePreview";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const user = await requireUser();
  return <OfficeShell email={user.email} logoutAction={logoutAction} active="notes"><NotesPreview /></OfficeShell>;
}
