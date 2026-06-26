import Link from "next/link";

const LAST_UPDATED = "2026-06-26";
const APP_NAME = "衣橱穿搭助手";
const PHASE = "阶段 1A（内部测试）";

export const metadata = {
  title: `${APP_NAME} · 测试阶段隐私政策`,
  description: `${APP_NAME} ${PHASE}隐私政策。本阶段服务器只收集账号与认证所需最小字段,衣橱数据、图片、AI Key 默认仅保存在用户本机。`,
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
            适用范围:{PHASE}　·　最近更新:{LAST_UPDATED}
          </p>
        </header>

        <Section title="1. 概要">
          <p>
            本应用以<strong>本机优先</strong>为原则:衣橱数据、衣物图片、MiniMax AI Key 默认<strong>只保存在用户本机</strong>,不进入我们的服务器。阶段 1A 的服务器仅承担账号与认证职责,本隐私政策仅描述阶段 1A 实际涉及的数据范围。
          </p>
          <p>
            本政策<strong>不适用于</strong>后续阶段将上线的衣橱云同步、图片云同步等扩展能力——那些能力上线时会单独更新政策。
          </p>
        </Section>

        <Section title="2. 我们收集哪些数据">
          <p>阶段 1A 服务器只收集以下与账号认证直接相关的最小字段:</p>
          <ul>
            <li>手机号（用于唯一标识账号,内部以规范化形式保存）;</li>
            <li>密码 Argon2id 哈希值（明文密码<strong>永不</strong>保存到服务器）;</li>
            <li>客户端在注册/登录时生成的 <code>clientSecret</code> 哈希（用于完成注册申请）;</li>
            <li>设备 ID（用于多设备会话与 Refresh Token 吊销,账号管理页仅展示当前设备标识）;</li>
            <li>Refresh Token、Refresh Token 过期时间、最近一次刷新时间;</li>
            <li>请求级元数据:IP、User-Agent（用于限流、防滥用和审计）;</li>
            <li>账号注册、验证、退出、改密事件的时间戳。</li>
          </ul>
        </Section>

        <Section title="3. 我们不收集哪些数据">
          <p>以下数据在阶段 1A <strong>不会</strong>进入我们的服务器:</p>
          <ul>
            <li>你的衣物条目、套装、心愿单、穿着记录、行程、打包清单、买前评估结果;</li>
            <li>你录入或拍摄的衣物图片(图片数据保存在本机 Dexie / 文件系统);</li>
            <li>你的 MiniMax / MiniMax API Key(只保存在本机 localStorage 或 Android WebView 存储);</li>
            <li>你的精确位置(GPS)、通讯录、相册等设备权限读取的内容;</li>
            <li>AI 调用(MiniMax 图像识别 / 穿搭建议 / 试穿预览)的请求正文与响应结果——这些调用由 App 客户端直接发起,使用本机保存的 AI Key,我们的服务器不参与转发、不存储明文。</li>
          </ul>
        </Section>

        <Section title="4. 数据存放在哪里">
          <ul>
            <li>账号与认证数据:保存在阶段 1A 的云端 PostgreSQL,部署在自有服务器（域名 api.zhengfangapps.cloud,公网 IP 111.231.98.86,Ubuntu 24.04）。</li>
            <li>Access Token:由 App 临时保存在内存或会话存储,过期即失效。</li>
            <li>Refresh Token:Android 版由 App 保存在 Keystore 支持的本机安全存储中;浏览器开发环境保存在 <code>sessionStorage</code>。服务器只保存哈希,不保存明文副本(仅在签发/刷新时回传用于校验)。</li>
            <li>衣橱数据与图片:阶段 1A 仍保存在本机 IndexedDB / Dexie / 应用文件目录;多账号物理隔离属于阶段 1B。</li>
            <li>MiniMax AI Key:仅保存在本机 localStorage,服务器不接收、不存储、不缓存。</li>
          </ul>
        </Section>

        <Section title="5. 加密与传输">
          <ul>
            <li>所有 API 走 HTTPS,由 Caddy 终止 TLS。</li>
            <li>密码使用 Argon2id 哈希后再写入数据库,不可逆。</li>
            <li>Token 使用短期 Access + 可撤销 Refresh 机制;Refresh Token 旋转,重放会被识别并吊销全部会话。</li>
            <li>认证 Token 在 Android 版使用 Keystore 支持的本机安全存储;MiniMax AI Key 与衣橱数据仍使用本机应用存储,root 或物理拿到手机的攻击者可能读取本机数据。</li>
          </ul>
        </Section>

        <Section title="6. 第三方服务">
          <p>
            阶段 1A 的服务器<strong>不</strong>对接任何第三方 AI 服务。AI 调用仅由 App 客户端发起,目标地址、请求内容与 Key 都由本机决定,服务器不参与。
          </p>
        </Section>

        <Section title="7. 留存与删除">
          <ul>
            <li>阶段 1A 未提供 App 内自助删除账号功能,账号数据在测试期内保留,除非由开发者执行测试清理。</li>
            <li>退出账号会清除本机认证凭据并吊销对应 Token,但不会删除云端账号记录。</li>
            <li><strong>退出或测试清理云端账号不会清除本机数据</strong>:本机衣橱、图片缓存、AI Key、未来阶段才会出现的 Outbox 仍保留,可由用户自行在系统设置或 App 内清理。</li>
            <li>测试期间,我们可能因测试需要整体清空云端数据,不会逐一通知。</li>
          </ul>
        </Section>

        <Section title="8. 您的权利">
          <p>在阶段 1A,你可以:</p>
          <ul>
            <li>查看当前账号与当前设备标识,并修改账号密码;</li>
            <li>退出当前设备,或一键<strong>退出全部设备</strong>;</li>
            <li>关闭认证开关 <code>NEXT_PUBLIC_CLOUD_AUTH_ENABLED</code> 后,完全以本机模式使用 App,不再产生账号数据。</li>
          </ul>
          <p>
            后续阶段会提供账号数据导出、衣橱云同步的关闭开关等更多能力,届时本政策会同步更新。
          </p>
        </Section>

        <Section title="9. 未成年人">
          <p>
            本阶段面向具备完全民事行为能力的测试用户。如不具备相应能力,请在监护人同意下使用。
          </p>
        </Section>

        <Section title="10. 测试阶段特殊说明">
          <p>
            阶段 1A 是<strong>内部测试</strong>。我们可能在不另行通知的情况下修改接口、清空数据或调整策略。测试期间:<strong>不承诺 SLA</strong>、<strong>不承诺客服渠道</strong>、<strong>不承诺跨境数据传输</strong>。如不同意,你可以不启用认证功能、继续以本机模式使用 App。
          </p>
        </Section>

        <Section title="11. 政策变更">
          <p>
            本政策随阶段升级而更新。重大变更会在 App 内重新展示。继续使用即视为同意更新后的政策。
          </p>
        </Section>

        <footer className="surface rounded-lg px-4 py-3 text-xs text-ink/55">
          <p>
            本政策<strong>不是</strong>面向公众的最终隐私政策,仅适用于阶段 1A 内部测试。后续阶段会发布面向正式用户的版本。
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
