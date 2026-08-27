// pages/api/socket.js
import { Server } from "ws";
import * as constants from "@/lib/constants";

let wsServer; // 서버를 전역으로 유지

export default function handler(req, res) {
  if (!wsServer) {
    // wsServer가 없으면 새로 생성
    const server = new Server({ noServer: true });

    server.on(constants.websocketMessageType.connection, (socket) => {
      console.log("WebSocket 연결됨");

      socket.on("message", (message) => {
        console.log("받은 메시지:", message.toString());
        // 받은 메시지를 그대로 클라이언트에 보냄 (echo)
        socket.send(`서버에서 응답: ${message}`);
      });

      socket.on(constants.websocketMessageType.close, () => {
        console.log("WebSocket 연결 종료");
      });
    });

    wsServer = server;

    console.log("WebSocket 서버 생성 완료");
  }

  // HTTP 요청은 그냥 종료
  res.status(200).json({ message: "WebSocket 서버 활성화됨" });
}

// Next.js 커스텀 서버에서 WebSocket 핸들링
export const config = {
  api: {
    bodyParser: false, // WebSocket은 bodyParser 사용 안함
  },
};
