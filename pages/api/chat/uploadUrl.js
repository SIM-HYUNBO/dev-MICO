"use strict";
// 채팅 첨부 직업로드 1단계 — 브라우저가 R2 로 직접 PUT 할 서명 URL 을 발급한다.
// 기존 /api/chat/upload 은 파일 전체를 앱서버 메모리에 모은 뒤 R2 로 넘겨서,
// 500MB 짜리 하나가 그대로 컨테이너 메모리를 먹었다. 여기서는 바이트가 앱서버를
// 지나지 않고, 서버는 "누가 어느 방에 올려도 되는지"만 판단한다.
import { v4 as uuidv4 } from "uuid";
import * as constants from "@/lib/constants";
import * as r2 from "@/lib/r2Storage";
import { isRoomMember } from "@/lib/chatUploadAuth";
import { deploymentSystemCode } from "@/lib/tenantResolver";

const MAX_BYTES = 500 * 1024 * 1024;

// 확장자는 클라이언트가 준 파일명이 아니라 mime 에서 정한다.
// 파일명에 담긴 값을 그대로 키에 쓰면 경로 조작 여지가 생긴다.
const ALLOWED_MIME = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export default async function handler(req, res) {
  // 테넌트는 서버가 요청으로부터 정한다.
  const SYSTEM_CODE = deploymentSystemCode();
  if (req.method !== "POST") return res.status(405).end();
  if (!r2.isR2Configured()) {
    // R2 가 없으면 직업로드 자체가 불가능하다. 클라이언트는 이 신호를 보고
    // 기존 서버 경유 업로드로 되돌아간다.
    return res.status(503).json({ error: "R2 not configured" });
  }

  const { roomId, userId, fileName, mimeType, size } = req.body || {};
  const ext = ALLOWED_MIME[String(mimeType || "").toLowerCase()];
  if (!ext) return res.status(400).json({ error: "지원하지 않는 파일 형식입니다." });
  if (Number(size) > MAX_BYTES) {
    return res.status(413).json({ error: "파일이 너무 큽니다 (최대 500MB)" });
  }
  if (!await isRoomMember(req, userId, roomId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const fileId = uuidv4();
    const key = r2.scopedKey(`chat/${roomId}/${fileId}.${ext}`);
    const url = await r2.getPresignedPutUrl(key, mimeType);
    // DB 행은 아직 만들지 않는다. 업로드가 중간에 끊기면 못 쓰는 행만 남으므로,
    // 실제로 올라온 것을 확인하는 uploadComplete 에서 만든다.
    return res.status(200).json({ fileId, key, url, fileName: fileName || "file" });
  } catch (e) {
    console.error("[chat/uploadUrl]", e.message);
    return res.status(500).json({ error: e.message });
  }
}
