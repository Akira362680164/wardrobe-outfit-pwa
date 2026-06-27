import type { Metadata } from "next";
import { LegalDocumentView, type LegalSection } from "@/components/auth/legal-document-view";

const LAST_UPDATED = "2026-06-27";
const APP_NAME = "衣橱穿搭助手";

export const metadata: Metadata = {
  title: `${APP_NAME} · 用户协议`,
  description: `${APP_NAME} 用户协议。`,
};

const SECTIONS: LegalSection[] = [
  {
    title: "1. 服务说明",
    children: (
      <p>
        衣橱穿搭助手是一款手机优先的衣橱识别、穿搭推荐与买前评估应用。用户使用手机号作为登录标识，
        注册后可使用云端工作区同步结构化衣橱数据。
      </p>
    ),
  },
  {
    title: "2. 账号注册与使用",
    children: (
      <>
        <p>用户使用手机号和密码注册账号。当前注册使用手机号与密码，不代表平台已经核验手机号归属。密码以 Argon2id 安全哈希形式保存，服务器不保存明文密码。</p>
        <p>一个账号可以在多个设备上登录。用户可修改密码、退出当前设备或退出全部设备。</p>
      </>
    ),
  },
  {
    title: "3. 云端数据与本机数据",
    children: (
      <>
        <p>账号登录后会使用云端工作区同步结构化衣橱数据（衣物、套装、心愿单、穿着记录、行程、穿搭计划）。开启图片同步后会通过自有 API 上传衣物图片及缩略图至服务器持久化存储。</p>
        <p>本机仍会保存离线工作所需的数据库和图片缓存。退出账号不会自动删除云端账号数据。</p>
      </>
    ),
  },
  {
    title: "4. 用户责任",
    children: (
      <p>
        用户不得滥用、攻击、批量注册或绕过安全限制。不得注册或使用不属于自己的手机号。
        MiniMax Key 属于本机设置，不上传至 wardrobe API。
      </p>
    ),
  },
  {
    title: "5. 服务变更与终止",
    children: (
      <p>
        我们保留根据需要调整、暂停或终止服务的权利。服务变更时将在 App 内展示更新后的协议。
      </p>
    ),
  },
  {
    title: "6. 适用法律",
    children: (
      <p>
        本协议适用中华人民共和国法律。争议优先友好协商；协商不成的，提交服务器运营方所在地有管辖权的人民法院解决。
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-mist px-4 py-6 text-ink">
      <div className="mx-auto flex w-full max-w-2xl flex-col">
        <LegalDocumentView
          title={`${APP_NAME} 用户协议`}
          lastUpdated={LAST_UPDATED}
          sections={SECTIONS}
        />
      </div>
    </main>
  );
}
