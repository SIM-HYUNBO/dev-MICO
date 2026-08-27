import Layout from "@/components/core/client/frames/layout";
import UserManualContent from "@/components/core/client/contents/userManualContent";

export default function UserManual() {
  return (
    <>
      <UserManualContent />
    </>
  );
}

// 페이지 전용 Layout 적용
UserManual.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
