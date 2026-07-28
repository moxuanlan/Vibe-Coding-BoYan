# 簿言 Bóyán

自建 Next.js + PostgreSQL 的工作簿检测与交接助手。当前已实现真实注册、登录、会话保护和静态产品页面；文件上传与 InfiniSynapse 分析将在下一阶段接入。

## 本地启动

1. 复制 `.env.example` 为 `.env.local`，填写 PostgreSQL 连接地址。
2. 在数据库执行 `db/migrations/001_auth.sql`。
3. 安装依赖并启动：`npm install`、`npm run dev`。

## 身份验证行为

- 用户以邮箱和至少 6 位密码注册。
- 注册成功后跳转登录页，不自动登录。
- 密码使用 Argon2id 哈希，数据库不保存明文。
- 连续 5 次密码错误后锁定账号 15 分钟。
- 会话令牌只以 HttpOnly、SameSite=Lax Cookie 传输；数据库只保存令牌 SHA-256 摘要。
- 未登录访问 `/workspace` 会跳转 `/login`。

## InfiniSynapse 配置

真实 API Key 只应保存在本地 `.env.local` 或部署平台的加密环境变量中，不得写入 README、提交到 GitHub 或暴露给浏览器。服务端后续通过以下变量调用：

- `INFINISYNAPSE_API_KEY`：服务端 API Key。
- `INFINISYNAPSE_SERVER_URL`：默认 `https://app.infinisynapse.cn`。

部署前需要在托管平台设置 `DATABASE_URL`、`DATABASE_SSL`、`INFINISYNAPSE_API_KEY` 和 `INFINISYNAPSE_SERVER_URL`。
