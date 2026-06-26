import Link from "next/link";

const LAST_UPDATED = "2026-06-27";
const APP_NAME = "衣橱穿搭助手";
const PHASE = "阶段 1A-1C（内部测试）";

export const metadata = {
  title: `${APP_NAME} · 测试阶段隐私政策`,
  description: `${APP_NAME} ${PHASE}隐私政策。本阶段服务器收集账号认证数据、衣橱结构化数据与穿搭图片，图片通过 COS 存储。`,
};

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-mist px-4 py-6 text-ink">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <header className="surface rounded-lg px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              className="text-xs font-semibold text-denim underline-offset-2 hover:underline"
            >
              ‹ 返回
            </Link>
            <span className="rounded-full bg-denim/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-denim">
              内部测试
            </span>
          </div>
          <h1 className="mt-3 text-xl font-bold tracking-tight">
            {APP_NAME} · 测试阶段隐私政策
          </h1>
          <p className="mt-1 text-xs text-ink/55">
            适用范围：{PHASE}　·　最近更新：{LAST_UPDATED}
          </p>
        </header>

        <Section title="1. 概要">
          <p>
            本应用已进入云同步测试阶段。除账号认证数据外，服务器还会接收衣橱结构化数据（单品、套装、心愿单、穿着记录、行程、穿搭计划）以及穿搭图片。<strong>云同步功能默认关闭</strong>，由用户在本机设置页显式开启。
          </p>
          <p>
            本政策描述阶段 1A-1C 实际涉及的数据范围。后续阶段新增能力时将更新本政策。
          </p>
        </Section>

        <Section title="2. 我们收集哪些数据">
          <p><strong>账号认证数据</strong>（始终收集，用于创建和登录账号）：</p>
          <ul>
            <li>手机号（规范化形式保存，界面仅展示脱敏手机号）；</li>
            <li>密码 Argon2id 哈希（明文密码<strong>永不</strong>保存）；</li>
            <li>设备 ID（用于多设备会话管理与 Refresh Token 吊销）；</li>
            <li>Refresh Token 哈希及其过期时间；</li>
            <li>请求元数据：IP、User-Agent（用于限流、防滥用和审计）；</li>
            <li>账号安全事件（注册、验证、登录、退出、改密）的时间戳与脱敏信息。</li>
          </ul>
          <p className="mt-2"><strong>衣橱结构化数据</strong>（仅在用户开启云同步后收集）：</p>
          <ul>
            <li>单品信息（名称、分类、颜色、季节、材质等属性，不含原始图片二进制）；</li>
            <li>套装组合（套装名称与包含的单品 ID 列表）；</li>
            <li>心愿单条目；</li>
            <li>穿着记录（单品/套装穿着日期）；</li>
            <li>行程计划（行程日期、目的地、活动类型）；</li>
            <li>穿搭计划（行程对应的每日穿搭安排）。</li>
          </ul>
          <p className="mt-2"><strong>图片数据</strong>（仅在用户开启云同步后上传）：</p>
          <ul>
            <li>衣物图片、套装封面图、心愿单图片；</li>
            <li>图片上传至腾讯云 COS，服务器仅保存元数据（SHA-256、文件类型、尺寸），不保存图片二进制。</li>
          </ul>
        </Section>

        <Section title="3. 我们不收集哪些数据">
          <p>以下数据<strong>不会</strong>进入我们的服务器：</p>
          <ul>
            <li>MiniMax API Key（只保存在本机 localStorage / Android WebView 存储）；</li>
            <li>精确位置（GPS）、通讯录、相册等设备权限读取的内容；</li>
            <li>AI 调用的请求正文与响应结果——这些调用由客户端直接发起，服务器不参与转发、不存储明文。</li>
          </ul>
        </Section>

        <Section title="4. 数据存放在哪里">
          <ul>
            <li><strong>账号与结构化数据</strong>：保存在云端 PostgreSQL（域名 api.zhengfangapps.cloud），与用户账号关联。</li>
            <li><strong>穿搭图片</strong>：上传至腾讯云 COS（对象存储），存储路径按账号隔离，下载通过预签名 URL。服务器不转发图片流。</li>
            <li><strong>本机数据</strong>：衣橱数据在本机 IndexedDB/Dexie 保留完整副本，图片缓存按账号分目录存储（Android：应用文件目录，浏览器：IndexedDB/内存缓存）。</li>
            <li><strong>Access Token</strong>：临时保存在内存或会话存储，过期即失效。</li>
            <li><strong>Refresh Token</strong>：Android 使用 Keystore 安全存储；浏览器使用 sessionStorage。服务器仅保存哈希。</li>
            <li><strong>MiniMax AI Key</strong>：仅保存在本机 localStorage。</li>
          </ul>
        </Section>

        <Section title="5. 加密与传输">
          <ul>
            <li>所有 API 走 HTTPS，由 Caddy 终止 TLS。</li>
            <li>密码使用 Argon2id 哈希后写入数据库，不可逆。</li>
            <li>Token 使用短期 Access + 可撤销 Refresh 机制；Refresh Token 使用一次即旋转，重放会识别并吊销全部会话。</li>
            <li>图片上传至 COS 使用 HTTPS，下载通过预签名 URL（含有效期）。</li>
            <li>Android Keystore 保护本地 Token 存储。</li>
          </ul>
        </Section>

        <Section title="6. 第三方服务">
          <ul>
            <li><strong>腾讯云 COS</strong>：穿搭图片存储，部署在境内地域。服务器生成预签名上传/下载 URL，图片二进制不经过业务服务器。</li>
            <li>本阶段<strong>不对接</strong>第三方 AI 服务。AI 调用由客户端直接发起。</li>
          </ul>
        </Section>

        <Section title="7. 留存与删除">
          <ul>
            <li>账号与结构化数据保留至用户请求删除或测试结束。</li>
            <li>图片在 COS 保留至用户请求删除或对应实体被删除；删除操作通过 API 触发，服务端同步清理 COS 对象。</li>
            <li>退出账号会清除本机认证凭据并吊销 Token。退出或吊销<strong>不会</strong>自动清除云端数据，需另行请求账号删除。</li>
            <li>本机衣橱数据、图片缓存、AI Key 在退出后保留，可由用户自行清理。</li>
            <li>测试期间，我们可能因测试需要整体清空云端数据。</li>
          </ul>
        </Section>

        <Section title="8. 您的权利">
          <p>在当前阶段，你可以：</p>
          <ul>
            <li>查看当前账号与设备标识，修改密码；</li>
            <li>退出当前设备或一键退出全部设备；</li>
            <li>随时关闭云同步开关（<code>NEXT_PUBLIC_CLOUD_SYNC_ENABLED</code>），关闭后不再产生新的云端数据；</li>
            <li>关闭认证开关后完全以本机模式使用 App。</li>
          </ul>
          <p>后续阶段将提供账号数据导出、自助删除等能力。</p>
        </Section>

        <Section title="9. 未成年人">
          <p>
            本阶段面向具备完全民事行为能力的测试用户。如不具备相应能力，请在监护人同意下使用。
          </p>
        </Section>

        <Section title="10. 测试阶段特殊说明">
          <p>
            阶段 1A-1C 是<strong>内部测试</strong>。我们可能在不另行通知的情况下修改接口、清空数据或调整策略。测试期间：<strong>不承诺 SLA</strong>、<strong>不承诺客服渠道</strong>、<strong>不承诺跨境数据传输</strong>。如不同意，你可以关闭云同步和认证功能、继续以本机模式使用 App。
          </p>
        </Section>

        <Section title="11. 政策变更">
          <p>
            本政策随阶段升级而更新。重大变更会在 App 内重新展示。继续使用即视为同意更新后的政策。
          </p>
        </Section>

        <footer className="surface rounded-lg px-4 py-3 text-xs text-ink/55">
          <p>
            本政策仅适用于阶段 1A-1C 内部测试，正式发布时将更新为面向公众的版本。
          </p>
        </footer>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface rounded-lg px-4 py-4 text-sm leading-relaxed text-ink/85 [&_p+p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul_li+li]:mt-1 [&_code]:rounded [&_code]:bg-ink/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_strong]:font-semibold [&_strong]:text-ink">
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
