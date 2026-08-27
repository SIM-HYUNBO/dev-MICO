import Layout from "@/components/core/client/frames/layout";
import Card from "@/components/core/client/ui/Card";
import Chip from "@/components/core/client/ui/Chip";
import * as userInfo from "@/components/core/client/frames/userInfo";

// 언어별 문구 선택(ko/en/ja). 법률 문구라 라벨 시스템 대신 콜로케이션으로 관리한다.
const pick = (ko, en, ja) => {
  const code = userInfo.getCurrentLanguageCode?.() || "ko-KR";
  return code.startsWith("ko") ? ko : code.startsWith("ja") ? ja : en;
};

export default function PrivacyPolicy() {
  const sections = [
    [
      pick("수집 항목", "Data collected", "収集項目"),
      pick(
        "계정 식별자, 이메일, 서비스 이용 기록, 푸시 알림 구독 정보 등 서비스 제공에 필요한 최소 정보를 수집합니다.",
        "We collect the minimum information needed to provide the service, such as account identifiers, email, service usage records, and push notification subscription details.",
        "アカウント識別子、メール、サービス利用記録、プッシュ通知購読情報など、サービス提供に必要な最小限の情報を収集します。",
      ),
    ],
    [
      pick("이용 목적", "Purpose of use", "利用目的"),
      pick(
        "로그인, 실시간 채팅, 문서 저장, 알림 발송, 고객 지원, 보안 감사와 서비스 품질 개선에 사용합니다.",
        "Used for login, real-time chat, document storage, sending notifications, customer support, security audits, and improving service quality.",
        "ログイン、リアルタイムチャット、文書保存、通知送信、カスタマーサポート、セキュリティ監査、サービス品質の改善に使用します。",
      ),
    ],
    [
      pick("보유 기간", "Retention period", "保有期間"),
      pick(
        "회원 탈퇴 또는 목적 달성 시 지체 없이 파기하며, 법령상 보관이 필요한 정보는 해당 기간 동안 분리 보관합니다.",
        "Data is destroyed without delay upon account withdrawal or when its purpose is achieved. Information that must be retained by law is stored separately for the required period.",
        "退会または目的達成時に遅滞なく破棄し、法令上保管が必要な情報は該当期間中、分離して保管します。",
      ),
    ],
    [
      pick("제3자 제공", "Sharing with third parties", "第三者提供"),
      pick(
        "법령에 근거한 요청을 제외하고 사용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다.",
        "We do not provide personal information to third parties without the user's consent, except for requests based on applicable law.",
        "法令に基づく要請を除き、ユーザーの同意なく個人情報を第三者に提供しません。",
      ),
    ],
  ];

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[var(--bg)] px-4 py-10 text-[var(--text)]">
      <main className="mx-auto max-w-4xl">
        <Chip tone="brand">{pick("최종 개정 · 2026년 4월 29일", "Last updated · April 29, 2026", "最終改定 · 2026年4月29日")}</Chip>
        <h1 className="mt-4 text-4xl font-extrabold text-[var(--text)]">{pick("개인정보처리방침", "Privacy Policy", "プライバシーポリシー")}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
          {pick(
            "Brunner는 사용자의 개인정보를 안전하게 보호하고, 서비스 제공에 필요한 범위 안에서만 처리합니다.",
            "Brunner protects your personal information and processes it only within the scope necessary to provide the service.",
            "Brunnerはユーザーの個人情報を安全に保護し、サービス提供に必要な範囲内でのみ処理します。",
          )}
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {sections.map(([title, body]) => (
            <Card key={title} className="p-5">
              <h2 className="text-lg font-extrabold text-[var(--text)]">{title}</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">{body}</p>
            </Card>
          ))}
        </div>
        <Card className="mt-5 bg-[var(--surface-alt)] p-5">
          <h2 className="text-base font-extrabold text-[var(--text)]">{pick("개인정보 보호 책임자", "Data Protection Officer", "個人情報保護責任者")}</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Brunner Support · support@brunner.co.kr</p>
        </Card>
      </main>
    </div>
  );
}

PrivacyPolicy.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
