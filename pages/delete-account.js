import Layout from "@/components/core/client/frames/layout";
import Button from "@/components/core/client/ui/Button";
import Card from "@/components/core/client/ui/Card";
import Chip from "@/components/core/client/ui/Chip";
import Input from "@/components/core/client/ui/Input";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as userInfo from "@/components/core/client/frames/userInfo";

export default function DeleteAccount() {
  const tl = (key) =>
    commonFunctions.getResourceByLanguage(key, constants.resourceType.label, userInfo.getCurrentLanguageCode?.() || "ko-KR");

  const deleted = ["delAcctDataChat", "delAcctDataDocs", "delAcctDataFriends", "delAcctDataWatchlist"];
  const reasons = ["delAcctReasonUnused", "delAcctReasonNoisy", "delAcctReasonPrivacy", "delAcctReasonOther", "delAcctReasonEtc"];

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[var(--bg)] px-4 py-10 text-[var(--text)]">
      <main className="mx-auto max-w-3xl">
        <Chip tone="danger">{tl("delAcctBadge")}</Chip>
        <h1 className="mt-4 text-4xl font-extrabold text-[var(--text)]">{tl("delAcctTitle")}</h1>
        <Card className="mt-6 border-[var(--danger)] bg-[rgba(239,68,68,0.05)] p-5">
          <div className="text-3xl">🗑</div>
          <h2 className="mt-3 text-lg font-extrabold text-[var(--danger)]">{tl("delAcctIrreversible")}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{tl("delAcctDesc")}</p>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {deleted.map((key) => <div key={key} className="rounded-[var(--radius-md)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold">{tl(key)}</div>)}
          </div>
        </Card>
        <Card className="mt-4 p-5">
          <h2 className="text-base font-extrabold">{tl("delAcctReasonHeading")}</h2>
          <div className="mt-3 grid gap-2">
            {reasons.map((key, index) => (
              <label key={key} className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-alt)] px-3 py-2 text-sm">
                <input type="radio" name="deleteReason" defaultChecked={index === 0} />
                {tl(key)}
              </label>
            ))}
          </div>
          <div className="mt-4">
            <label className="mb-2 block text-xs font-bold text-[var(--text-muted)]">{tl("delAcctEmailVerify")}</label>
            <div className="flex gap-2">
              <Input aria-label={tl("delAcctEmailVerify")} placeholder="m***@example.com" />
              <Button variant="ghost">{tl("delAcctSendMail")}</Button>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <Button variant="ghost" onClick={() => history.back()}>{tl("cancel")}</Button>
            <Button variant="danger">{tl("delAcctProceed")}</Button>
          </div>
        </Card>
      </main>
    </div>
  );
}

DeleteAccount.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
