"use strict";

export default function handler(req, res) {
  const clientId = (process.env.KAKAO_REST_API_KEY || process.env.NEXT_PUBLIC_KAKAO_API_KEY || "").trim();
  if (!clientId) {
    return res.status(500).send("Kakao REST API key is not configured.");
  }

  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = `${proto}://${host}`;
  const redirectUri = `${origin}/auth/kakao`;
  const state = typeof req.query.state === "string" ? req.query.state : "login";

  // scope 를 안 주면 카카오는 앱에 설정된 기본 동의항목만 준다. 닉네임 동의가
  // 빠져 있으면 프로필 응답에 nickname 이 없고, 그때마다 User1234 같은 임시
  // 이름이 그대로 계정 이름이 됐다. 필요한 항목을 명시적으로 요청한다.
  // 심사받지 않은 항목을 넣으면 카카오가 요청 자체를 거절하므로 환경변수로
  // 조정할 수 있게 둔다.
  const scope = (process.env.KAKAO_SCOPE || "profile_nickname,profile_image").trim();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });
  if (scope) params.set("scope", scope);

  return res.redirect(302, `https://kauth.kakao.com/oauth/authorize?${params.toString()}`);
}
