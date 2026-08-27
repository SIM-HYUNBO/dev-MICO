import Layout from "@/components/core/client/frames/layout";
import ScheduleContent from "@/components/core/client/contents/scheduleContent";

export default function Schedule() {
  return <ScheduleContent />;
}

Schedule.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
