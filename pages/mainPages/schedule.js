import Layout from "@/components/core/client/frames/layout";
import ScheduleContent from "@/components/core/client/contents/scheduleContent";
import MTabBar from "@/components/core/client/frames/mTabBar";

export default function Schedule() {
  return (
    <>
      <ScheduleContent />
      <MTabBar />
    </>
  );
}

Schedule.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
