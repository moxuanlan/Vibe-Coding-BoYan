"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/app/actions/auth";

type Props = {
  mode: "login" | "register";
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  registered?: boolean;
};

const initialState: AuthState = {};

export function AuthForm({ mode, action, registered = false }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const isLogin = mode === "login";

  return (
    <form action={formAction} className="auth-form">
      {registered && <div className="success-message" role="status">注册成功，请使用新账号登录。</div>}
      {state.error && <div className="error-message" role="alert">{state.error}</div>}

      <label className="field">
        <span>邮箱地址</span>
        <input name="email" type="email" autoComplete="email" required placeholder="name@example.com" />
      </label>
      <label className="field">
        <span>密码</span>
        <input name="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} required minLength={isLogin ? 1 : 6} placeholder={isLogin ? "输入密码" : "至少 6 个字符"} />
      </label>
      {!isLogin && (
        <label className="field">
          <span>确认密码</span>
          <input name="confirmPassword" type="password" autoComplete="new-password" required minLength={6} placeholder="再次输入密码" />
        </label>
      )}

      <button className="primary auth-submit" disabled={pending}>
        {pending ? "请稍候…" : isLogin ? "登录并进入簿言" : "创建账号"}
        {!pending && <span className="arrow">→</span>}
      </button>
      <p className="auth-switch">
        {isLogin ? "还没有账号？" : "已经注册？"}
        <Link href={isLogin ? "/register" : "/login"}>{isLogin ? "创建账号" : "返回登录"}</Link>
      </p>
    </form>
  );
}
