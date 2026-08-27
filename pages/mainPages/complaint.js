import Layout from "@/components/core/client/frames/layout";
import ComplaintContent from "@/components/core/client/contents/complaintContent";

export default function Complaint() {
  return (
    <>
      <ComplaintContent />
    </>
  );
}

// 페이지 전용 Layout 적용
Complaint.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
