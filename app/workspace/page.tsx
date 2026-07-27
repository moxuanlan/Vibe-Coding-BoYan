import { logoutAction } from "@/app/actions/auth";
import { WorkspacePreview } from "@/app/components/WorkspacePreview";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const user = await requireUser();
  return <WorkspacePreview email={user.email} logoutAction={logoutAction} />;
}
