import Layout from "@/components/core/client/frames/layout";
import Card from "@/components/core/client/ui/Card";
import Chip from "@/components/core/client/ui/Chip";
import UserActivityDashboardContent from "@/components/core/client/contents/userActivityDashboardContent";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as userInfo from "@/components/core/client/frames/userInfo";

export default function AdminHub() {
  const tl = (key) =>
    commonFunctions.getResourceByLanguage(key, constants.resourceType.label, userInfo.getCurrentLanguageCode?.() || "ko-KR");

  const kpis = [
    ["adminKpiActiveUsers", "-"],
    ["adminKpiApiCallsToday", "-"],
    ["adminKpiNewSignups7d", "-"],
  ];

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[var(--bg)] px-4 py-6 text-[var(--text)]">
      <div className="mx-auto max-w-7xl">
        <Chip tone="danger">🛡️ {tl("adminMode")}</Chip>
        <h1 className="mt-3 text-3xl font-extrabold">{tl("adminDashboard")}</h1>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {kpis.map(([key, value]) => (
            <Card key={key} className="p-4">
              <div className="text-xs font-semibold text-[var(--text-muted)]">{tl(key)}</div>
              <div className="font-mono-data mt-2 text-2xl font-extrabold">{value}</div>
            </Card>
          ))}
        </div>
        <div className="mt-4">
          <UserActivityDashboardContent variant="summary" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="font-extrabold">{tl("adminRecentTxLog")}</h2>
            <div className="mt-3 rounded-[var(--radius-md)] bg-[var(--surface-alt)] p-4 font-mono-data text-xs text-[var(--text-muted)]">{tl("adminNo5xxLog")}</div>
          </Card>
          <Card className="p-5">
            <h2 className="font-extrabold">{tl("adminCurrentDeploy")}</h2>
            <div className="mt-3 rounded-[var(--radius-lg)] bg-[image:var(--brand-gradient)] p-5 text-white">review-cross-check</div>
          </Card>
        </div>
      </div>
    </div>
  );
}

AdminHub.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
