"use strict";
import { v4 as uuidv4 } from "uuid";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import * as constants from "@/lib/constants";
import * as r2 from "@/lib/r2Storage";
import { deploymentSystemCode } from "@/lib/tenantResolver";

export const config = { api: { bodyParser: false, responseLimit: false } };

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

export default async function handler(req, res) {
  // 테넌트는 서버가 요청으로부터 정한다.
  const SYSTEM_CODE = deploymentSystemCode();
  if (req.method !== "POST") return res.status(405).end();

  const { roomId, userId, mimeType, fileName } = req.query;
  if (!roomId || !userId || !mimeType) {
    return res.status(400).json({ error: "Missing required query params" });
  }

  try {
    const chunks = [];
    let totalSize = 0;

    for await (const chunk of req) {
      totalSize += chunk.length;
      if (totalSize > MAX_BYTES) {
        return res.status(413).json({ error: "파일이 너무 큽니다 (최대 500MB)" });
      }
      chunks.push(chunk);
    }

    const fileData = Buffer.concat(chunks);
    const fileId = uuidv4();

    if (r2.isR2Configured()) {
      const ext = (fileName || "file").split(".").pop();
      const r2Key = r2.scopedKey(`chat/${roomId}/${fileId}.${ext}`);
      await r2.uploadFile(r2Key, fileData, mimeType);

      const sql = await dynamicSql.getSQL(SYSTEM_CODE, "insert_TB_COR_CHAT_FILE", 2);
      await database.executeSQL(sql, [
        SYSTEM_CODE, fileId, roomId, userId,
        fileName || "file", mimeType, fileData.length, r2Key,
      ]);
    } else {
      const sql = await dynamicSql.getSQL(SYSTEM_CODE, "insert_TB_COR_CHAT_FILE", 1);
      await database.executeSQL(sql, [
        SYSTEM_CODE, fileId, roomId, userId,
        fileName || "file", mimeType, fileData.length, fileData,
      ]);
    }

    return res.status(200).json({ id: fileId });
  } catch (e) {
    console.error("[chat/upload]", e.message);
    return res.status(500).json({ error: e.message });
  }
}
