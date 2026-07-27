import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { AuthForm } from "@/app/components/AuthForm";
import { AuthShell } from "@/app/components/AuthShell";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ registered?: string }> }) {
  if (await getCurrentUser()) redirect("/workspace");
  const params = await searchParams;
  return (
    <AuthShell eyebrow="Welcome back" title="登录簿言" description="继续查看你的工作簿体检与交接报告。">
      <AuthForm mode="login" action={loginAction} registered={params.registered === "1"} />
    </AuthShell>
  );
}
