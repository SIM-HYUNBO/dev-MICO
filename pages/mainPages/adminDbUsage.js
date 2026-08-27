import Layout from "@/components/core/client/frames/layout";
import AdminDbUsageContent from "@/components/core/client/contents/adminDbUsageContent";

export default function AdminDbUsagePage() {
  return <AdminDbUsageContent />;
}

AdminDbUsagePage.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
