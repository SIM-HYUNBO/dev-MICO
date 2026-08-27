import Layout from "@/components/core/client/frames/layout";
import UserActivityDashboardContent from "@/components/core/client/contents/userActivityDashboardContent";

export default function UserActivityDashboardPage() {
  return <UserActivityDashboardContent variant="full" />;
}

UserActivityDashboardPage.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
