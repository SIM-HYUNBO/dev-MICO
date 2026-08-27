import Layout from "@/components/core/client/frames/layout";
import TransactionHistoryContent from "@/components/core/client/contents/transactionHistoryContent";
import Card from "@/components/core/client/ui/Card";
import Chip from "@/components/core/client/ui/Chip";
import Input from "@/components/core/client/ui/Input";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as userInfo from "@/components/core/client/frames/userInfo";

export default function AdminTransactions() {
  const tl = (key) =>
    commonFunctions.getResourceByLanguage(key, constants.resourceType.label, userInfo.getCurrentLanguageCode?.() || "ko-KR");

  const stats = [{ code: "2xx" }, { code: "4xx" }, { code: "5xx" }, { key: "adminAvgResponse" }];

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[var(--bg)] px-4 py-5 text-[var(--text)]">
      <div className="mx-auto max-w-7xl">
        <Chip tone="danger">🛡️ {tl("adminMode")}</Chip>
        <h1 className="mt-2 text-2xl font-extrabold">{tl("adminTxHistory")}</h1>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.code || s.key} className="p-4">
              <div className="text-xs text-[var(--text-muted)]">{s.key ? tl(s.key) : s.code}</div>
              <div className="font-mono-data mt-2 text-xl font-extrabold">-</div>
            </Card>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Input placeholder={tl("search")} aria-label={tl("search")} />
          <select className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm">
            <option>All</option>
            <option>5xx</option>
          </select>
        </div>
        <div className="mt-4 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
          <TransactionHistoryContent />
        </div>
      </div>
    </div>
  );
}

AdminTransactions.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
