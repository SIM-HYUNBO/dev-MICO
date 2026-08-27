import "@/styles/globals.css";
// 테마 오버레이 — 기본 팔레트 위에 덮어쓴다. 이 줄을 지우면 원래 색으로 돌아간다.
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ThemeProvider } from "next-themes";
import Head from "next/head";
import { setupPwaInstall } from "@/lib/pwaInstall";
import { setAppBadgeCount } from "@/lib/nativeBadge";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as userInfo from "@/components/core/client/frames/userInfo";
import { RequestServer } from "@/components/core/client/requestServer";

const AUTO_RECOVER_FLAG = "brunner_auto_recovered";

// 폰 홈화면 앱 아이콘 배지를 서버의 안읽음 합계로 다시 맞춘다.
//
// 배지를 켜는 곳은 둘이다 — 푸시를 받은 서비스워커, 그리고 채팅 화면.
// 끄는 곳은 알림을 탭했을 때와 채팅 화면뿐이었다. 그래서 앱을 열어도 채팅
// 화면에 들어가지 않으면 배지가 그대로 남는다. 다른 기기에서 읽었거나
// 안읽음이 이미 사라진 뒤에도 숫자가 계속 붙어 있었다.
//
// 앱을 열 때와 다시 앞으로 가져올 때 한 번씩 맞춘다. 채팅 화면에 있는 동안은
// wsChatClient 가 계속 갱신하므로 여기서 주기적으로 돌 필요는 없다.
const BADGE_SYNC_MIN_GAP_MS = 30 * 1000;
let lastBadgeSyncAt = 0;

const syncAppBadge = async () => {
  if (typeof document === "undefined" || document.visibilityState === "hidden") return;
  const now = Date.now();
  if (now - lastBadgeSyncAt < BADGE_SYNC_MIN_GAP_MS) return;
  lastBadgeSyncAt = now;

  // 로그아웃 상태에서 남은 숫자는 그대로 두면 지울 사람이 없다.
  if (!userInfo.isLogin()) {
    setAppBadgeCount(0);
    return;
  }
  try {
    const res = await RequestServer({
      commandName: constants.commands.CHATROOM_LIST,
            userId: userInfo.getLoginUserId(),
    });
    if (res.error_code !== constants.errorCode.Success) return;
    const total = (res.data || []).reduce((sum, room) => {
      const n = Number(
        room?.unread_count ?? room?.unreadCount ?? room?.unread_message_count ?? room?.unreadMessageCount ?? 0,
      );
      return sum + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
    setAppBadgeCount(total);
  } catch {
    // 실패하면 그냥 둔다. 잘못 지우는 것보다 남겨두는 편이 낫다.
  }
};

// 이 기기의 푸시 구독을 현재 서비스(테넌트) 소유로 되찾는다.
//
// 왜
//   구독은 브라우저(오리진)마다 따로지만 DB 는 여러 서비스가 한 테이블을 공유한다.
//   구독 행에 서비스가 안 적혀 있으면 한 서비스의 채팅 알림이 다른 서비스 앱에서도
//   울린다. 앱을 열 때 조용히 자기 서비스 것으로 다시 등록해, 옛 기기 행도 스스로
//   제자리를 찾게 한다.
let pushSubscriptionReclaimed = false;
const reclaimPushSubscription = async () => {
  if (pushSubscriptionReclaimed) return;
  pushSubscriptionReclaimed = true;
  try {
    if (!userInfo.isLogin()) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!("serviceWorker" in navigator)) return;
    if (localStorage.getItem(constants.pushPreferenceStorageKey) === "false") return;

    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription?.();
    if (!subscription) return;

    await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: userInfo.getLoginUserId(),
        subscription: subscription.toJSON(),
      }),
    });
  } catch {
    // 실패해도 화면에는 영향이 없다 — 다음 실행 때 다시 시도한다.
  }
};

// 설치 프롬프트는 페이지가 뜬 직후 한 번만 터진다 — 컴포넌트 마운트를 기다리면 놓친다.
// 번들이 실행되는 순간(라우팅·렌더보다 먼저) 리스너를 붙인다.
setupPwaInstall();

// 배포 버전 스큐 자동 갱신 — 화면 전환마다 서버 배포버전과 로드된 번들 버전을 비교.
const CLIENT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "";
const UPDATE_ATTEMPT_KEY = "brunner_update_attempt";
let lastVersionCheckAt = 0;

// 스테일 번들/서비스워커/캐시로 인한 버전 스큐 정리 — 새 배포 후 옛 청크·하이드레이션 불일치를 실제로 해소한다.
const clearStaleClientState = async () => {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
  } catch {}
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
    }
  } catch {}
};

// 화면 전환 시 서버 배포버전을 확인해, 로드된 번들이 구버전이면 캐시·SW를 비우고 한 번 새로고침한다.
// 15초 스로틀 + 세션당 동일 서버버전 1회만 시도(무한 새로고침 루프 방지).
const checkForUpdate = async () => {
  if (typeof window === "undefined" || !CLIENT_VERSION) return;
  const now = Date.now();
  if (now - lastVersionCheckAt < 15000) return;
  lastVersionCheckAt = now;

  let serverVer = "";
  try {
    const res = await fetch("/api/build-info", { cache: "no-store" });
    const info = await res.json();
    serverVer = info?.version || "";
  } catch {
    return; // 네트워크 실패는 무시
  }
  if (!serverVer || serverVer === CLIENT_VERSION) return;

  let attempted = null;
  try { attempted = sessionStorage.getItem(UPDATE_ATTEMPT_KEY); } catch {}
  if (attempted === serverVer) return; // 이미 이 버전으로 시도함 → 루프 방지
  try { sessionStorage.setItem(UPDATE_ATTEMPT_KEY, serverVer); } catch {}

  await clearStaleClientState();
  window.location.reload();
};

// 눈에 띄지 않게 로그만 남기고 무시해도 되는 잡음 에러(광고·크로스오리진·ResizeObserver 등)
const isBenignError = (message = "") => {
  const m = String(message || "");
  return (
    m === "Script error." ||
    m.includes("ResizeObserver loop") ||
    m.includes("Non-Error promise rejection") ||
    m.includes("adsbygoogle") ||
    m.includes("googlesyndication") ||
    m.includes("ampproject")
  );
};

// 복구 화면은 앱이 깨진 최후 상황에서 뜨므로 앱 라벨 시스템에 의존하지 않고
// navigator.language만으로 ko/en/ja를 고른다.
const pickLang = (ko, en, ja) => {
  const l = (typeof navigator !== "undefined" && navigator.language) || "ko";
  return l.startsWith("ko") ? ko : l.startsWith("ja") ? ja : en;
};

const highlightMissingResourceText = (root = document.body) => {
  if (typeof document === "undefined" || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.nodeValue?.includes("[리소스 없음:")) continue;
    if (node.parentElement?.closest("[data-resource-missing-warning]")) continue;
    targets.push(node);
  }

  for (const node of targets) {
    const span = document.createElement("span");
    span.dataset.resourceMissingWarning = "true";
    span.className = "resource-missing-warning";
    span.textContent = node.nodeValue;
    node.parentNode?.replaceChild(span, node);
  }
};

function MissingResourceHighlighter() {
  useEffect(() => {
    highlightMissingResourceText();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            highlightMissingResourceText(node.parentElement || document.body);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            highlightMissingResourceText(node);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}

function ClientRecoveryScreen({ error }) {
  const [busy, setBusy] = useState(false);

  const recover = async () => {
    setBusy(true);
    try {
      localStorage.removeItem("userInfo");
      sessionStorage.removeItem("brunner_last_client_error");
      sessionStorage.removeItem(AUTO_RECOVER_FLAG);
    } catch {}
    await clearStaleClientState();
    window.location.replace("/mainPages/signin");
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center px-5"
      style={{ background: "var(--bg, #f7f8fb)", color: "var(--text, #111827)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border p-6 text-center shadow-lg"
        style={{ borderColor: "var(--border, #e5e7eb)", background: "var(--surface, #fff)" }}
      >
        <div className="text-lg font-bold">{pickLang("잠깐만, 화면을 다시 준비할게", "One moment, re-preparing the screen", "少々お待ちを、画面を再準備します")}</div>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted, #6b7280)" }}>
          {pickLang(
            "이 기기에 남은 이전 화면 정보가 새 버전과 맞지 않아 멈췄어. 아래 버튼을 누르면 로그인 화면을 새로 열고 바로 복구할 수 있어.",
            "Old screen data on this device doesn't match the new version, so it stalled. Tap the button below to open a fresh sign-in screen and recover right away.",
            "この端末に残った以前の画面情報が新しいバージョンと合わず停止しました。下のボタンを押すとサインイン画面を開き直してすぐに復旧できます。",
          )}
        </p>
        <button
          type="button"
          onClick={recover}
          disabled={busy}
          className="mt-5 w-full rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          style={{ background: "var(--brand-blue, #2563eb)" }}
        >
          {pickLang("복구하고 로그인하기", "Recover and sign in", "復旧してサインイン")}
        </button>
      </div>
    </div>
  );
}

const rememberClientError = (error, extra = {}) => {
  try {
    sessionStorage.setItem(
      "brunner_last_client_error",
      JSON.stringify({
        message: error?.message || String(error),
        stack: error?.stack || "",
        at: new Date().toISOString(),
        ...extra,
      }),
    );
  } catch {}
  // 진단(임시): componentStack을 서버로 보내 원인 컴포넌트를 특정한다. 실패 무시.
  try {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        message: error?.message || String(error),
        componentStack: extra?.componentStack || "",
        url: typeof location !== "undefined" ? location.href : "",
      }),
    }).catch(() => {});
  } catch {}
};

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[app error boundary]", error, info);
    rememberClientError(error, { componentStack: info?.componentStack || "" });

    // 렌더 크래시는 대개 새 배포 직후 옛 청크/하이드레이션 스큐가 원인 → 세션당 1회 자동 치유(캐시 정리 후 현재 화면 새로고침).
    // 자동 치유 후에도 같은 크래시가 다시 나면 그때만 수동 복구 화면을 유지한다.
    try {
      if (!sessionStorage.getItem(AUTO_RECOVER_FLAG)) {
        sessionStorage.setItem(AUTO_RECOVER_FLAG, "1");
        clearStaleClientState().finally(() => window.location.reload());
      }
    } catch {}
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <ClientRecoveryScreen error={this.state.error} />;
  }
}

// 전역 비동기/스크립트 에러는 화면을 통째로 덮지 않는다 — 진단용으로만 기록한다.
// (광고·소켓·백그라운드 fetch의 사소한 rejection 하나로 앱 전체가 막히던 문제 제거)
function ClientErrorGuard({ children }) {
  useEffect(() => {
    const handleError = (event) => {
      if (isBenignError(event.message)) return;
      rememberClientError(event.error || new Error(event.message || "window.error"), {
        source: event.filename || "window.error",
      });
    };
    const handleRejection = (event) => {
      const reason = event.reason;
      const message = reason?.message || String(reason || "unhandledrejection");
      if (isBenignError(message)) return;
      rememberClientError(reason instanceof Error ? reason : new Error(message), {
        source: "unhandledrejection",
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return children;
}

export default function App({ Component, pageProps }) {
  const getLayout = Component.getLayout || ((page) => page);
  const router = useRouter();
  const [, setResourceTextReady] = useState(0);

  useEffect(() => {
    commonFunctions.loadResourceTextCache().finally(() => {
      setResourceTextReady((value) => value + 1);
    });
  }, []);

  // 최초 진입 + 화면 전환마다 배포 버전 확인 → 구버전이면 자동 갱신.
  useEffect(() => {
    checkForUpdate();
    const onRouteDone = () => checkForUpdate();
    router.events.on("routeChangeComplete", onRouteDone);
    return () => router.events.off("routeChangeComplete", onRouteDone);
  }, [router.events]);

  // 앱을 열 때 이 기기의 푸시 구독을 현재 서비스 소유로 다시 등록한다.
  useEffect(() => {
    reclaimPushSubscription();
  }, []);

  // 앱 아이콘 배지를 열 때·앞으로 올 때 서버 값으로 맞춘다.
  useEffect(() => {
    syncAppBadge();
    const onFocus = () => syncAppBadge();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  useEffect(() => {
    try {
      const scale = parseFloat(localStorage.getItem("appFontScale") || "1.0");
      document.documentElement.style.fontSize = `${(Number.isFinite(scale) ? scale : 1) * 16}px`;
    } catch {
      document.documentElement.style.fontSize = "1rem";
    }
    // 렌더가 정상적으로 자리잡으면 자동 치유 플래그를 풀어, 이후 별개의 일시적 에러도 다시 1회 자동 치유 기회를 준다.
    const t = setTimeout(() => {
      try { sessionStorage.removeItem(AUTO_RECOVER_FLAG); } catch {}
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <ThemeProvider attribute="class">
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        {/* 검색엔진 사이트 소유확인 */}
        <meta name="google-site-verification" content="0NjCR8Oeag392VHJc6laQOZrR5izEE1andWzk_EN7Lk" />
        <meta name="naver-site-verification" content="1aad5e1d68afd0a21a2c179d6b23de1035c55fae" />
        {/* 전역 OG/SNS 공유 기본값 — 개별 페이지(공개 작품 등)는 같은 key로 덮어쓴다 */}
        <meta name="description" key="description" content="AI 봇이 직접 만들고 운영하는 AI 채팅·컨텐츠 생성 앱 Brunner. 암호화 실시간 채팅과 AI 스튜디오로 웹툰·웹소설·에세이·쇼츠를 만들어 연재하세요." />
        <meta property="og:site_name" key="og:site_name" content="Brunner" />
        <meta property="og:type" key="og:type" content="website" />
        <meta property="og:title" key="og:title" content="Brunner — AI 봇이 만들고 운영하는 AI 채팅·컨텐츠 생성 앱" />
        <meta property="og:description" key="og:description" content="암호화 실시간 채팅과 AI 스튜디오로 웹툰·웹소설·에세이·쇼츠를 연재하세요. 이 앱의 코드도 AI 에이전트가 쓰고 매일 배포합니다." />
        <meta property="og:image" key="og:image" content="https://www.brunner.co.kr/icon-512.png" />
        <meta property="og:url" key="og:url" content="https://www.brunner.co.kr" />
        <meta name="twitter:card" key="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" key="twitter:title" content="Brunner — AI 봇이 만들고 운영하는 AI 채팅·컨텐츠 생성 앱" />
        <meta name="twitter:description" key="twitter:description" content="암호화 실시간 채팅과 AI 스튜디오로 웹툰·웹소설·에세이·쇼츠를 연재하세요. 이 앱의 코드도 AI 에이전트가 쓰고 매일 배포합니다." />
        <meta name="twitter:image" key="twitter:image" content="https://www.brunner.co.kr/icon-512.png" />
      </Head>
      <AppErrorBoundary>
        <ClientErrorGuard>
          <MissingResourceHighlighter />
          {getLayout(<Component {...pageProps} />)}
        </ClientErrorGuard>
      </AppErrorBoundary>
    </ThemeProvider>
  );
}
