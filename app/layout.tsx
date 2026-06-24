import "../src/app/globals.css";

export const metadata = {
  title: '衣橱穿搭助手',
  description: 'AI 衣橱管理 + 套装推荐',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
