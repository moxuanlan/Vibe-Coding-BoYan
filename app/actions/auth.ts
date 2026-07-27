"use server";

import argon2 from "argon2";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession } from "@/lib/auth";
import { db } from "@/lib/db";

export type AuthState = { error?: string };

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("请输入有效的邮箱地址"),
  password: z.string().min(6, "密码至少需要 6 个字符").max(128, "密码不能超过 128 个字符"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "两次输入的密码不一致",
  path: ["confirmPassword"],
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

export async function registerAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "请检查注册信息" };

  const passwordHash = await argon2.hash(parsed.data.password, { type: argon2.argon2id });
  try {
    await db.query("INSERT INTO users (email, password_hash) VALUES ($1, $2)", [parsed.data.email, passwordHash]);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return { error: "该邮箱已经注册，请直接登录" };
    console.error("Registration failed", error);
    return { error: "注册暂时不可用，请稍后再试" };
  }
  redirect("/login?registered=1");
}

export async function loginAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "邮箱或密码不正确" };

  const result = await db.query<{
    id: string; password_hash: string; failed_login_count: number; locked_until: Date | null;
  }>("SELECT id, password_hash, failed_login_count, locked_until FROM users WHERE email = $1 LIMIT 1", [parsed.data.email]);
  const user = result.rows[0];
  if (!user) return { error: "邮箱或密码不正确" };
  if (user.locked_until && new Date(user.locked_until) > new Date()) return { error: "尝试次数过多，请 15 分钟后再试" };

  const valid = await argon2.verify(user.password_hash, parsed.data.password);
  if (!valid) {
    await db.query(
      `UPDATE users SET failed_login_count = failed_login_count + 1,
       locked_until = CASE WHEN failed_login_count + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END,
       updated_at = NOW() WHERE id = $1`,
      [user.id],
    );
    return { error: "邮箱或密码不正确" };
  }

  await db.query("UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1", [user.id]);
  await createSession(user.id);
  redirect("/workspace");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
