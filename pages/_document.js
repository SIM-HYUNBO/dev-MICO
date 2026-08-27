import { Html, Head, Main, NextScript } from "next/document";
import { THEMES, DEFAULT_THEME_ID, withChannelVars } from "@/lib/themes";

// 기본 컬러테마(gray)의 다크 변수를 첫 페인트 전에 baseline으로 주입한다.
// → globals.css/컴포넌트가 --theme-* 를 그대로 참조하면 되고, 하드코딩 hex fallback이 필요 없다.
//   (사용자가 다른 테마를 고르면 applyTheme가 인라인 스타일로 덮어씀)
// 채널 쌍둥이(--theme-*-rgb)도 같이 넣는다. 없으면 첫 페인트에서 반투명 배경이
// 통째로 사라졌다가 applyTheme 후에야 나타난다.
const _t = THEMES[DEFAULT_THEME_ID] || {};
const THEME_BASELINE_CSS =
  `.dark{${withChannelVars(_t.dark).map(([k, v]) => `${k}:${v}`).join(";")}}`;

export default function Document() {
  return (
    <Html>
      <Head>
        <style dangerouslySetInnerHTML={{ __html: THEME_BASELINE_CSS }} />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover, interactive-widget=resizes-content" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/favicon.png?v=9" />
        {/* iOS는 투명 코너를 검게 채우므로 애플터치는 full-bleed maskable로 연결 */}
        <link rel="apple-touch-icon" href="/pwa-maskable-512.png?v=9" />

        {/* iOS PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Brunner" />

        <meta name="theme-color" content="#3b82f6" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
