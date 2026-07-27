import type { ReactNode } from "react";

export function AuthShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="auth-brand"><span className="brand-mark">簿</span><span className="brand-name">簿言 <small>Bóyán</small></span></div>
        <div className="auth-story-copy">
          <span className="eyebrow">Workbook intelligence</span>
          <h1>让每一份复杂表格，<br /><em>都说得清楚。</em></h1>
          <p>结构、公式、数据与业务口径，一次梳理清楚。</p>
        </div>
        <div className="mini-sheet" aria-hidden="true">
          <div className="mini-sheet-bar"><i /><i /><i /><span>月度销售利润表.xlsx</span></div>
          <div className="mini-grid"><b>发现 8 个待复核事项</b><span>汇总公式可能遗漏新增数据行</span></div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <span className="panel-label">{eyebrow}</span>
          <h2>{title}</h2>
          <p className="auth-description">{description}</p>
          {children}
          <p className="security-note">密码采用 Argon2id 加密保存，登录凭证仅通过安全 Cookie 传递。</p>
        </div>
      </section>
    </main>
  );
}
