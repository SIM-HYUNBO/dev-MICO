import Layout from "@/components/core/client/frames/layout";
import OpenChatContent from "@/components/core/client/contents/openChatContent";

export default function OpenChat() {
  return <OpenChatContent />;
}

OpenChat.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
