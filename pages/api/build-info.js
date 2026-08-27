import { describePushConfig } from "@/lib/webPush";
import { getDbBackupStatus } from "@/lib/dbBackupCron";

export default async function handler(req, res) {
  // Keep this endpoint lightweight because deploy checks poll it frequently.
  res.setHeader("Cache-Control", "no-store, no-cache, max-age=0, s-maxage=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");

  // 시크릿 값은 절대 노출하지 않고, "설정 여부(불리언)"만 보고한다 — 배포 후 provider 구성 확인용.
  const has = (v) => !!process.env[v];

  res.status(200).json({
    service: "brunner-template",
    version: process.env.NEXT_PUBLIC_APP_VERSION || null,
    buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || null,
    commitSha:
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.RAILWAY_GIT_COMMIT_SHA_SHORT ||
      process.env.GITHUB_SHA ||
      process.env.NEXT_PUBLIC_COMMIT_SHA ||
      null,
    railwayEnvironment: process.env.RAILWAY_ENVIRONMENT_NAME || null,
    // 이 서버가 실제로 어디서 도는지. 응답 헤더의 x-railway-edge 는 엣지
    // 리전이라 컨테이너 리전과 다를 수 있어, 서버가 직접 말하게 둔다.
    // 한국 사용자와의 물리적 거리는 응답 속도에 그대로 나타나므로 배포
    // 위치는 확인 가능해야 한다.
    region:
      process.env.RAILWAY_REPLICA_REGION ||
      process.env.RAILWAY_REGION ||
      null,
    providers: {
      // 이미지·쇼츠 생성(fal) — AI 스튜디오 이미지/웹툰의 핵심
      fal: has("FAL_KEY"),
      // 이미지/영상 저장소
      r2: !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY),
      // 텍스트 provider
      cerebras: has("CEREBRAS_API_KEY"),
      groq: has("GROQ_API_KEY"),
      gemini: has("GEMINI_API_KEY"),
      anthropic: has("ANTHROPIC_API_KEY"),
      openai: has("OPENAI_API_KEY"),
      // 유튜브 업로드 — 어느 값이 서버에 실제로 들어갔는지 밖에서 확인할 수 있어야
      // 환경변수 등록이 됐는지 추측하지 않는다(값은 노출하지 않고 존재 여부만).
    },
    // 이 프로세스가 언제 떴는지. 재기동했는데 증상이 그대로일 때
    // "정말 새로 떴는가"를 밖에서 판별할 수 있어야 한다(빌드 시각은 이미지에 박혀 있어 변하지 않는다).
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    // 설치 마법사가 "정말 붙었는가" 를 밖에서 판별할 수 있어야 한다. 값은 절대
    // 노출하지 않고 구성 여부와 연결 성공 여부만 보고한다.
    db: {
      urlConfigured: has("DATABASE_URL"),
      schema: process.env.DB_SCHEMA || null,
      schemaOwned: String(process.env.DB_SCHEMA_OWNED || "").toLowerCase() === "true",
      systemCode: process.env.SYSTEM_CODE || null,
    },
    redis: {
      configured: has("REDIS_URL"),
      connected: globalThis.__brunnerRedisActive === true,
    },
    // 푸시 설정을 이 프로세스가 어떻게 보고 있는지(값은 노출하지 않음).
    push: describePushConfig(),
    // 백업이 실제로 돌고 있는지. 실패를 로그에만 남기면 백업이 없는 상태가 그대로 유지된다.
    backup: getDbBackupStatus(),
    checkedAt: new Date().toISOString(),
  });
}
