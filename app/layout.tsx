import type { Metadata } from "next";
import "./globals.css";
import "./office.css";
import "./note-overrides.css";

export const metadata: Metadata = {
  title: "簿言 Bóyán｜让复杂表格说得清楚",
  description: "工作簿体检与交接助手",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
