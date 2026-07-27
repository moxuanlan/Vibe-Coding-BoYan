import { redirect } from "next/navigation";
import { registerAction } from "@/app/actions/auth";
import { AuthForm } from "@/app/components/AuthForm";
import { AuthShell } from "@/app/components/AuthShell";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/workspace");
  return (
    <AuthShell eyebrow="Create account" title="创建你的账号" description="注册完成后，我们会带你返回登录页面。">
      <AuthForm mode="register" action={registerAction} />
    </AuthShell>
  );
}
