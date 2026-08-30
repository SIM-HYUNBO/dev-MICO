import Layout from "@/components/core/client/frames/layout";
import AdminResourceTextContent from "@/components/core/client/contents/adminResourceTextContent";

export default function AdminResourceText() {
  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[var(--bg)] text-[var(--text)]">
      <AdminResourceTextContent />
    </div>
  );
}

AdminResourceText.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
