"use client";

import { useState } from "react";
import Layout from "@/components/core/client/frames/layout";
import UserFriendContent from "@/components/core/client/contents/userFriendContent";
import ChatClient from "@/components/core/client/wsChatClient";

export default function UserFriend() {
  const [chatRoomId, setChatRoomId] = useState(null);
  const [chatRoomName, setChatRoomName] = useState(null);

  const handleStartChat = (roomId, roomName) => {
    setChatRoomId(roomId);
    setChatRoomName(roomName);
  };

  const handleStartSecretChat = (roomId, roomName) => {
    setChatRoomId(roomId);
    setChatRoomName(roomName);
  };

  const closeChat = () => {
    setChatRoomId(null);
    setChatRoomName(null);
  };

  return (
    <div className="relative flex flex-col w-full h-full">
      {/* 🔹 친구 목록 */}
      <div className="flex-1 min-h-0">
        <UserFriendContent
          onStartChat={handleStartChat}
          onStartSecretChat={handleStartSecretChat}
        />
      </div>

      {/* 🔥 채팅 모달 (Portal처럼 작동하는 오버레이) */}
      {chatRoomId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          {/* 모달 컨테이너 */}
          <div className="semi-text-bg-color w-full max-w-lg h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* 헤더: 고정 높이 */}
            <div className="shrink-0 flex justify-between items-center px-6 py-4 border-b">
              <h3 className="font-bold">{chatRoomName}</h3>
              <button onClick={closeChat} className="text-2xl">
                ✕
              </button>
            </div>

            {/* 채팅 영역: 남은 공간 모두 차지 (flex-1) */}
            <div className="flex-1 min-h-0 relative">
              <ChatClient
                externalRoomId={chatRoomId}
                externalRoomName={chatRoomName}
              />
            </div>
          </div>

          {/* 모달 바깥 배경 클릭 시 닫기 (선택 사항) */}
          <div className="absolute inset-0 -z-10" onClick={closeChat}></div>
        </div>
      )}
    </div>
  );
}

UserFriend.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
