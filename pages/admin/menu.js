import Layout from "@/components/core/client/frames/layout";
import AdminMenuContent from "@/components/core/client/contents/adminMenuContent";

export default function AdminMenuPage() {
  return <AdminMenuContent />;
}

AdminMenuPage.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
