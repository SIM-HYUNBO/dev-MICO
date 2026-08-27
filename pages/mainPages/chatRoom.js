import { useRouter } from "next/router";
import Layout from "@/components/core/client/frames/layout";
import ChatRoomContent from "@/components/core/client/contents/chatroomContent";

export default function ChatRoom() {
  const router = useRouter();
  const { roomId, roomName, roomType } = router.query;

  return (
    <>
      <ChatRoomContent
        initialRoomId={roomId}
        initialRoomName={roomName ? decodeURIComponent(roomName) : undefined}
        onLeaveRoom={() => router.replace("/")}
        roomTypeFilter={roomType}
      />
    </>
  );
}

// 페이지 전용 Layout 적용
ChatRoom.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
