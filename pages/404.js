import Button from "@/components/core/client/ui/Button";
import BrunnerWordmark from "@/components/core/client/ui/BrunnerWordmark";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as userInfo from "@/components/core/client/frames/userInfo";

const L = (key) =>
  commonFunctions.getResourceByLanguage(
    key,
    constants.resourceType.label,
    userInfo.getCurrentLanguageCode(),
  );

export default function PageNotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--bg)] px-4 text-center text-[var(--text)]">
      <div>
        <BrunnerWordmark className="text-[26px] font-extrabold" />
        <div className="gradient-text mt-4 text-8xl font-extrabold md:text-9xl">404</div>
        <h1 className="mt-4 text-2xl font-extrabold">{L("notFoundTitle")}</h1>
        <p className="mt-3 text-sm text-[var(--text-muted)]">{L("notFoundDesc")}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => window.location.href = "/"}>{L("goHome")}</Button>
        </div>
      </div>
    </main>
  );
}
