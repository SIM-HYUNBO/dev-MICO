"use strict";
// 채팅 첨부 직업로드 2단계 — R2 에 실제로 올라온 것을 확인하고 DB 행을 만든다.
// 크기·존재 여부는 클라이언트 말이 아니라 R2 에 직접 물어본다.
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import * as constants from "@/lib/constants";
import * as r2 from "@/lib/r2Storage";
import { isRoomMember } from "@/lib/chatUploadAuth";
import { deploymentSystemCode } from "@/lib/tenantResolver";

const MAX_BYTES = 500 * 1024 * 1024;

export default async function handler(req, res) {
  // 테넌트는 서버가 요청으로부터 정한다.
  const SYSTEM_CODE = deploymentSystemCode();
  if (req.method !== "POST") return res.status(405).end();

  const { roomId, userId, fileId, key, fileName, mimeType } = req.body || {};
  if (!roomId || !userId || !fileId || !key) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  // 발급받은 자리에만 행을 만들 수 있게 키 모양을 되짚는다.
  // 이게 없으면 남의 객체 키를 넣어 자기 메시지로 붙일 수 있다.
  if (!String(key).startsWith(r2.scopedKey(`chat/${roomId}/${fileId}.`))) {
    return res.status(400).json({ error: "Invalid key" });
  }
  if (!await isRoomMember(req, userId, roomId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const head = await r2.headObject(key);
    if (!head) return res.status(404).json({ error: "업로드된 파일을 찾을 수 없습니다." });
    if (head.size <= 0) return res.status(400).json({ error: "빈 파일입니다." });
    if (head.size > MAX_BYTES) {
      // 서명 URL 로 한도를 강제할 수 없으니 여기서 걸러내고 객체도 지운다.
      await r2.deleteFile(key).catch(() => {});
      return res.status(413).json({ error: "파일이 너무 큽니다 (최대 500MB)" });
    }

    const sql = await dynamicSql.getSQL(SYSTEM_CODE, "insert_TB_COR_CHAT_FILE", 2);
    await database.executeSQL(sql, [
      SYSTEM_CODE, fileId, roomId, userId,
      fileName || "file", head.mimeType || mimeType || "application/octet-stream",
      head.size, key,
    ]);

    return res.status(200).json({ id: fileId });
  } catch (e) {
    console.error("[chat/uploadComplete]", e.message);
    return res.status(500).json({ error: e.message });
  }
}
