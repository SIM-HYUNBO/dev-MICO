import Layout from "@/components/core/client/frames/layout";
import TransactionHistoryContent from "@/components/core/client/contents/transactionHistoryContent";

export default function TransactionHistory() {
  return (
    <>
      <TransactionHistoryContent />
    </>
  );
}

// 페이지 전용 Layout 적용
TransactionHistory.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
