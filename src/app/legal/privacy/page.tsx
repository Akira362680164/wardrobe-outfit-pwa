import type { Metadata } from "next";
import { LegalDocumentView, type LegalSection } from "@/components/auth/legal-document-view";

const LAST_UPDATED = "2026-06-27";
const APP_NAME = "衣橱穿搭助手";

export const metadata: Metadata = {
  title: `${APP_NAME} · 隐私政策`,
  description: `${APP_NAME} 隐私政策。`,
};

const SECTIONS: LegalSection[] = [
  {
    title: "1. 我们处理的数据",
    children: (
      <>
        <p><strong>账号数据：</strong>手机号登录标识（规范化保存）、密码 Argon2id 哈希、设备会话信息。新注册手机号当前不经过短信归属核验。</p>
        <p><strong>云端工作区数据：</strong>衣物、套装、心愿单、穿着记录、行程计划和相关同步数据。</p>
        <p><strong>图片数据：</strong>开启图片同步时会上传原图、缩略图、图片元数据和对象存储地址。</p>
        <p><strong>AI Key：</strong>MiniMax Key 保存在本机 localStorage，不进入 wardrobe API。</p>
        <p><strong>安全事件：</strong>只保存脱敏或哈希后的必要信息，不保存明文密码或 Token。</p>
      </>
    ),
  },
  {
    title: "2. 数据用途",
    children: (
      <p>
        账号数据用于身份认证与多设备会话管理。衣橱结构化数据用于跨设备同步与穿搭推荐。
        图片数据用于在设备间同步衣物视觉信息。安全事件用于限流、防滥用和安全审计。
      </p>
    ),
  },
  {
    title: "3. 本机数据与云端数据",
    children: (
      <>
        <p>衣橱数据在本机 IndexedDB/Dexie 保留完整副本，图片缓存按账号分目录存储。</p>
        <p>Access Token 临时保存在内存或会话存储。Refresh Token 在 Android 使用 Keystore 安全存储，浏览器使用 sessionStorage。服务器仅保存哈希。</p>
        <p>MiniMax AI Key 仅保存在本机 localStorage。</p>
      </>
    ),
  },
  {
    title: "4. 数据安全",
    children: (
      <>
        <p>密码使用 Argon2id 哈希后写入数据库，不可逆。Token 使用短期 Access + 可撤销 Refresh 机制。</p>
        <p>图片上传走 HTTPS，下载通过预签名 URL。本机安全存储保存认证凭证。</p>
      </>
    ),
  },
  {
    title: "5. 数据保留",
    children: (
      <>
        <p>账号与结构化数据保留至用户请求删除。退出账号会清除本机认证凭据并吊销 Token，但不会自动清除云端数据。</p>
        <p>本机衣橱数据、图片缓存、AI Key 在退出后保留，可由用户自行清理。</p>
      </>
    ),
  },
  {
    title: "6. 政策更新",
    children: (
      <p>
        本政策随版本升级而更新。重大变更会在 App 内重新展示。继续使用即视为同意更新后的政策。
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-mist px-4 py-6 text-ink">
      <div className="mx-auto flex w-full max-w-2xl flex-col">
        <LegalDocumentView
          title={`${APP_NAME} 隐私政策`}
          lastUpdated={LAST_UPDATED}
          sections={SECTIONS}
        />
      </div>
    </main>
  );
}
