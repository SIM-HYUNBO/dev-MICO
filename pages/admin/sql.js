import Layout from "@/components/core/client/frames/layout";
import DynamicSqlContent from "@/components/core/client/contents/dynamicSqlContent";
import Card from "@/components/core/client/ui/Card";
import Chip from "@/components/core/client/ui/Chip";
import Input from "@/components/core/client/ui/Input";
import Button from "@/components/core/client/ui/Button";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as userInfo from "@/components/core/client/frames/userInfo";

export default function AdminSql() {
  const tl = (key) =>
    commonFunctions.getResourceByLanguage(key, constants.resourceType.label, userInfo.getCurrentLanguageCode?.() || "ko-KR");

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[var(--bg)] px-4 py-5 text-[var(--text)]">
      <div className="mx-auto max-w-7xl">
        <Chip tone="danger">🛡️ {tl("adminMode")}</Chip>
        <h1 className="mt-2 text-2xl font-extrabold">{tl("adminDynamicSql")}</h1>
        <div className="mt-4 grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          <Card className="p-4">
            <Input placeholder={tl("adminSearchSqlName")} aria-label={tl("adminSearchSqlName")} />
            <div className="mt-3 flex flex-wrap gap-2">
              {["select", "insert", "update", "delete"].map((verb) => <Chip key={verb} tone="neutral">{verb}</Chip>)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="mb-3 flex justify-end gap-2">
              <Button variant="ghost">{tl("adminTest")}</Button>
              <Button>{tl("save")}</Button>
            </div>
            <DynamicSqlContent />
          </Card>
        </div>
      </div>
    </div>
  );
}

AdminSql.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
