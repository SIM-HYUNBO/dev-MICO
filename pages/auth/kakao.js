"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/core/client/frames/layout";
import Loading from "@/components/core/client/loading";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as appUserInfo from "@/components/core/client/frames/userInfo";

const L = (key) =>
  commonFunctions.getResourceByLanguage(
    key,
    constants.resourceType.label,
    appUserInfo.getCurrentLanguageCode(),
  );

export default function KakaoCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!router.isReady) return;

    const { code, state, error: kakaoError } = router.query;

    if (kakaoError) {
      setError(L("kakaoLoginCancelled"));
      return;
    }

    if (!code) return;

    const redirectUri = `${window.location.origin}/auth/kakao`;
    const kakaoClientId = process.env.NEXT_PUBLIC_KAKAO_API_KEY;

    const doLogin = async () => {
      try {
        const linkUserId =
          typeof state === "string" && state.startsWith("linkKakao:")
            ? state.replace("linkKakao:", "")
            : null;

        const res = await fetch("/api/auth/kakao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, redirectUri, linkUserId, kakaoClientId }),
        });

        let userInfo;
        try {
          userInfo = await res.json();
        } catch {
          setError(L("kakaoServerError").replace("{status}", res.status));
          return;
        }

        if (!res.ok || userInfo.error) {
          setError(userInfo.error || L("kakaoLoginFailed"));
          return;
        }

        // 메뉴는 저장하지 않는다 — 로그인 직후 미리 만들면 '비로그인 메뉴'가 굳어버린다.
        delete userInfo.menuItems;
        localStorage.setItem("userInfo", JSON.stringify(userInfo));
        window.dispatchEvent(new CustomEvent("userChanged", { detail: { userId: userInfo.userId } }));

        if (state && state.startsWith("chatInvite:")) {
          const inviteToken = state.replace("chatInvite:", "");
          router.replace(`/invite/${inviteToken}`);
        } else if (state && state.startsWith("friendInvite:")) {
          const inviteCode = state.replace("friendInvite:", "");
          router.replace(`/invite/${inviteCode}`);
        } else if (state && state.startsWith("linkKakao:")) {
          router.replace("/mainPages/userAccount");
        } else {
          router.replace("/");
        }
      } catch (e) {
        setError(e?.message || L("genericErrorRetry"));
      }
    };

    doLogin();
  }, [router.isReady, router.query]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      {error ? (
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            className="px-4 py-2 bg-yellow-400 text-black rounded font-bold"
            onClick={() => router.replace("/mainPages/signin")}
          >
            {L("goToLoginPage")}
          </button>
        </div>
      ) : (
        <>
          <Loading />
          <p className="text-sm text-gray-400">{L("kakaoLoggingIn")}</p>
        </>
      )}
    </div>
  );
}

KakaoCallbackPage.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
