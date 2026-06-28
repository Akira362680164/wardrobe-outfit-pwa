import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { MotionProvider } from "@/components/motion-provider";

export const metadata: Metadata = {
  title: "衣橱穿搭助手",
  description: "本地优先的衣橱管理与穿搭推荐 PWA",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "衣橱助手",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f5f3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var JWT_RE=/eyJ[a-zA-Z0-9_-]+\\.eyJ[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+/g;var REDACT='***JWT***';var SK=['accessToken','refreshToken','access_token','refresh_token','idToken'];function rk(o){for(var i=0;i<SK.length;i++){var k=SK[i];if(o[k])o[k]='***REDACTED***';}return o;}function redact(v){if(typeof v==='string'){try{var o=JSON.parse(v);if(o&&typeof o==='object'){var s=JSON.stringify(o);if(JWT_RE.test(s)){JWT_RE.lastIndex=0;s=s.replace(JWT_RE,REDACT);o=JSON.parse(s);}return JSON.stringify(rk(o));}}catch(e){}return v.replace(JWT_RE,REDACT);}if(v&&typeof v==='object'){try{var s2=JSON.stringify(v);if(JWT_RE.test(s2)){JWT_RE.lastIndex=0;return rk(JSON.parse(s2.replace(JWT_RE,REDACT)));}return rk(v);}catch(e){}}return v;}var _log=console.log,_dir=console.dir,_group=console.groupCollapsed;console.log=function(){for(var i=0;i<arguments.length;i++)arguments[i]=redact(arguments[i]);return _log.apply(console,arguments);};console.dir=function(v){return _dir.call(console,redact(v));};console.groupCollapsed=function(){for(var i=0;i<arguments.length;i++)arguments[i]=redact(arguments[i]);return _group.apply(console,arguments);};})();`,
          }}
        />
      </head>
      <body>
        <MotionProvider>{children}</MotionProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
