import Link from "next/link";

const LAST_UPDATED = "2026-06-26";
const APP_NAME = "衣橱穿搭助手";
const PHASE = "阶段 1A（内部测试）";

export const metadata = {
  title: `${APP_NAME} · 测试阶段用户协议`,
  description: `${APP_NAME} ${PHASE}用户协议。本阶段仅包含账号注册、登录、退出、改密等账号服务,不含衣橱云同步、图片云同步、短信验证、微信验证、客服渠道承诺。`,
};

export default function TermsPage() {
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
            {APP_NAME} · 测试阶段用户协议
          </h1>
          <p className="mt-1 text-xs text-ink/55">
            适用范围:{PHASE}　·　最近更新:{LAST_UPDATED}
          </p>
        </header>

        <Section title="1. 这是什么">
          <p>
            本协议适用于<strong>{APP_NAME}</strong>的<strong>阶段 1A 内部测试包</strong>。本阶段仅交付账号服务（注册 / 登录 / 刷新 / 退出 / 改密），不含衣橱云同步、图片云同步、买前评估云端化、多账号本地工作区、短信验证、微信验证、客服渠道支持。
          </p>
          <p>
            本应用以手机优先的本地 PWA + Android APK 形式交付,核心衣橱数据默认保存在用户本机;本阶段云端<strong>只</strong>保存账号与认证相关字段。
          </p>
        </Section>

        <Section title="2. 账号注册与登录">
          <p>
            阶段 1A 使用<strong>手机号 + 密码</strong>注册和登录。密码以 Argon2id 算法哈希后保存,服务器不保存明文密码。注册申请 30 分钟内未完成验证会自动过期。
          </p>
          <p>
            本阶段<strong>不提供短信验证码</strong>、<strong>不提供微信扫码验证</strong>、不提供邮箱验证。注册后的账号申请通过<strong>开发期 CLI</strong>完成验证（verificationSource = development_cli），仅用于内部测试,后续阶段会替换。
          </p>
        </Section>

        <Section title="3. 认证功能开关（默认关闭）">
          <p>
            阶段 1A 引入功能开关 <code>NEXT_PUBLIC_CLOUD_AUTH_ENABLED</code>。该开关的<strong>默认值为 false</strong>。
          </p>
          <ul>
            <li>开关为 false:App 直接进入现有本地衣橱界面,不需要账号,可以像以往一样使用。</li>
            <li>开关为 true:App 启用账号注册、登录、刷新、退出和账号管理 UI;在未登录时不能进入衣橱主界面。</li>
          </ul>
          <p>
            内部测试 APK 由构建配置决定开关取值,用户不必自行配置。本阶段不会把生产默认值打开,直到用户另行确认。
          </p>
        </Section>

        <Section title="4. 设备与会话">
          <p>
            一个账号可以同时在多个设备上登录。每个设备独立产生 Refresh Token。阶段 1A 的账号管理页展示当前设备标识,并提供<strong>退出当前设备</strong>和<strong>退出全部设备</strong>;本阶段不提供完整设备列表页。密码修改会吊销此前签发的全部 Refresh Token。
          </p>
          <p>
            Access Token 用于请求 API,Refresh Token 用于刷新 Access Token;Token 不会展示给用户明文。
          </p>
        </Section>

        <Section title="5. 退出账号会发生什么">
          <p><strong>退出账号不会删除以下数据:</strong></p>
          <ul>
            <li>本机已保存的衣橱数据（衣物、套装、心愿单、穿着记录、行程、打包清单等）;</li>
            <li>本机衣物图片缓存;</li>
            <li>未来阶段才会出现的“未同步 Outbox”（本阶段尚不存在）;</li>
            <li>本机保存的 MiniMax AI Key。</li>
          </ul>
          <p>
            退出账号会清除本机认证凭据并吊销本设备 Refresh Token。再次使用该账号必须在线重新登录;阶段 1A 不提供离线首次登录或离线恢复登录。
          </p>
        </Section>

        <Section title="6. AI Key 设备级声明">
          <p>
            MiniMax API Key 是<strong>设备级 Key</strong>,只保存在本机的浏览器 localStorage 或 Android WebView 本地存储里。它<strong>不</strong>上传到本应用服务器,<strong>不</strong>进入账号云端,<strong>不</strong>随账号退出或账号删除被清空,也<strong>不</strong>绑定到具体账号。
          </p>
          <p>
            同一台设备上的多个账号共用同一份 AI Key。切换设备需要在新设备上单独配置自己的 AI Key。本应用服务器不保存、不转发、不缓存你的 AI Key。
          </p>
        </Section>

        <Section title="7. 第三方服务">
          <p>
            本阶段服务器端<strong>不</strong>调用 MiniMax 或任何第三方 AI 服务。AI 调用由 App 客户端直接发起,使用本机保存的 AI Key,请求目标由用户在 App 中配置。服务器不接收、不存储 AI 请求正文。
          </p>
        </Section>

        <Section title="8. 用户行为规范">
          <p>你同意不在本应用上从事以下行为:</p>
          <ul>
            <li>注册或使用不属于自己的手机号;</li>
            <li>尝试绕过、破解、逆向 APK 或本应用代码;</li>
            <li>对服务器进行拒绝服务、扫描、注入或其他滥用行为;</li>
            <li>用同一身份频繁注册、批量测试或绕过限流。</li>
          </ul>
        </Section>

        <Section title="9. 测试阶段免责">
          <p>阶段 1A 是<strong>内部测试</strong>,不构成公开服务承诺:</p>
          <ul>
            <li>功能、数据、接口可能随时调整,无单独通知;</li>
            <li>账号与认证数据可能因测试需要被清空,不会逐一通知;</li>
            <li>本应用不对测试期间的数据丢失、可用性中断或结果正确性承担任何赔偿责任;</li>
            <li>测试期间<strong>不承诺客服渠道</strong>、<strong>不承诺服务等级协议 (SLA)</strong>、<strong>不承诺数据导出</strong>（后续阶段再提供）。</li>
          </ul>
        </Section>

        <Section title="10. 协议变更">
          <p>
            本协议可能随阶段升级而更新。更新后会在 App 内重新展示,继续使用即视为同意更新后的协议。如不同意,可以选择不再使用本阶段测试功能。
          </p>
        </Section>

        <Section title="11. 适用法律与争议">
          <p>
            本协议适用中华人民共和国法律。争议优先友好协商;协商不成的,提交服务器运营方所在地有管辖权的人民法院解决。
          </p>
        </Section>

        <footer className="surface rounded-lg px-4 py-3 text-xs text-ink/55">
          <p>
            本协议<strong>不是</strong>面向公众的最终服务条款,仅适用于阶段 1A 内部测试。后续阶段会发布面向正式用户的版本。
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
