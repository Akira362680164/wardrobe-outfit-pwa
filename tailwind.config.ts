import type { Config } from "tailwindcss";

type ColorFn = (args: { opacityValue: string }) => string;

const ink: ColorFn = ({ opacityValue }) => `rgb(29 34 40 / ${opacityValue})`;
const mist: ColorFn = ({ opacityValue }) => `rgb(244 245 243 / ${opacityValue})`;
const moss: ColorFn = ({ opacityValue }) => `rgb(95 112 88 / ${opacityValue})`;
const clay: ColorFn = ({ opacityValue }) => `rgb(185 113 85 / ${opacityValue})`;
const denim: ColorFn = ({ opacityValue }) => `rgb(53 92 125 / ${opacityValue})`;
const berry: ColorFn = ({ opacityValue }) => `rgb(140 74 98 / ${opacityValue})`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 用函数形式让 Tailwind JIT 编译任意 opacity 数字
        // (Tailwind 3 的 `<alpha-value>` 字符串语法在 JIT 扫描时只接受默认
        //  opacity scale 里的数字, `bg-ink/72` 这类非标 opacity 会被 silently
        //  丢弃; 函数形式则让 JIT 在拿到 `72` 后调用函数生成 `rgb(... / 0.72)`)
        // 修复 MotionImageLightbox 等位置 `bg-ink/72` backdrop 透明的 bug
        // 用 `as unknown as ...` 绕过 Tailwind 类型未暴露的 color-function 形态 (运行时 OK)
        ink: ink as unknown as string,
        mist: mist as unknown as string,
        moss: moss as unknown as string,
        clay: clay as unknown as string,
        denim: denim as unknown as string,
        berry: berry as unknown as string,
      },
      // Tailwind 3 解析 `bg-ink/72` 这种 alpha 数字时会查 theme.opacity[72];
      // 默认 scale 只含 5/10/20/25/30/40/50/60/70/75/80/90/95/100, 不含的会 silently 丢弃.
      // 扩展 1-100 全整数, 配合上面 colors 函数形式, 让任意 alpha 都能编译.
      opacity: {
        ...Object.fromEntries(
          Array.from({ length: 100 }, (_, i) => [String(i + 1), String((i + 1) / 100)])
        ),
      },
      boxShadow: {
        soft: "0 18px 50px rgba(29, 34, 40, 0.10)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
