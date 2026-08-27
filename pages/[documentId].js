import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import * as userInfo from "@/components/core/client/frames/userInfo";
import * as commonFunctions from "@/lib/commonFunctions";
import Layout from "@/components/core/client/frames/layout";
import EDocContent from "@/components/core/client/eDoc/eDocContent";
import Loading from "@/components/core/client/loading";
import Card from "@/components/core/client/ui/Card";
import Chip from "@/components/core/client/ui/Chip";

export default function EDocument() {
  const router = useRouter();
  const { documentId } = router.query;
  const [currentLoginUserId, setCurrentLoginUserId] = useState("");
  const [currentLanguageCode, setCurrentLanguageCode] = useState("");

  const [documentData, setDocumentData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!documentId) return;
    const loginUserId = userInfo.getLoginUserId();
    const languageCode = userInfo.getCurrentLanguageCode() || null;
    setCurrentLoginUserId(loginUserId);
    setCurrentLanguageCode(languageCode);

    const fetchDocData = async () => {
      try {
        setLoading(true);
        const docData = await commonFunctions.getDocumentData(
          languageCode ?? undefined,
          loginUserId,
          documentId,
        );
        setDocumentData(docData);
      } catch (e) {
        console.error("문서 데이터 로드 실패:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchDocData();
  }, [documentId]);

  const title = documentData?.runtime_data?.title || documentId || "Document";
  const isPublic = Boolean(documentData?.runtime_data?.isPublic);

  return (
    <Layout>
      <div className="min-h-[calc(100dvh-4rem)] bg-[var(--bg)] px-4 pb-16 text-[var(--text)]">
        {loading || !documentData ? (
          <div className="relative min-h-[50vh] flex-1 overflow-auto">
            {loading && <Loading />}
          </div>
        ) : (
          <div className="mx-auto max-w-6xl">
            <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-[var(--border)] bg-page/95 py-3 backdrop-blur">
              <span className="text-xl">📄</span>
              {isPublic && <Chip tone="brand">Public</Chip>}
            </header>
            <div className="grid gap-4 py-5 md:grid-cols-[220px_minmax(0,1fr)]">
              <Card className="hidden h-fit p-4 md:block">
                <div className="text-sm font-bold text-[var(--text)]">Document</div>
                <div className="mt-3 space-y-2 text-xs text-[var(--text-muted)]">
                  <div>Author: {documentData?.runtime_data?.createdBy || "-"}</div>
                  <div>Pages: {documentData?.pages?.length || 0}</div>
                  <div>Views: -</div>
                </div>
              </Card>
              <main className="mx-auto w-full max-w-[720px] rounded-[var(--radius-lg)] bg-white p-4 text-slate-900 shadow-[var(--shadow-card)] md:p-8">
                <h1 className="mb-1 text-2xl font-extrabold text-slate-900">{title}</h1>
                <p className="mb-4 text-xs text-slate-400">ID {documentId}</p>
                <EDocContent
                  argDocumentId={documentId}
                  argDocumentData={documentData}
                  isViewerMode={true}
                />
              </main>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
