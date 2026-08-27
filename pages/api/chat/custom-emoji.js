"use strict";

import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import * as constants from "@/lib/constants";
import * as r2 from "@/lib/r2Storage";
import { v4 as uuidv4 } from "uuid";
import { deploymentSystemCode } from "@/lib/tenantResolver";

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

const EMOJI_EXT_BY_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export const config = { api: { bodyParser: { sizeLimit: "3mb" } } };

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

async function verifySession(userId, sessionToken, SYSTEM_CODE) {
  if (!userId || !sessionToken) return false;
  try {
    const sql = await dynamicSql.getSQL(SYSTEM_CODE, "select_TB_COR_USER_SESSION", 1);
    const result = await database.executeSQL(sql, [SYSTEM_CODE, sessionToken, userId]);
    return result.rowCount > 0;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  // ?뚮꼳?몃뒗 ?쒕쾭媛 ?붿껌?쇰줈遺???뺥븳??
  const SYSTEM_CODE = deploymentSystemCode();
  if (req.method === "GET") {
    const { userId } = req.query;
    if (!await verifySession(userId, getBearerToken(req), SYSTEM_CODE)) return res.status(401).json({ error: "Unauthorized" });
    const sql = await dynamicSql.getSQL(SYSTEM_CODE, "select_TB_COR_CHAT_CUSTOM_EMOJI_LIST", 1);
    const result = await database.executeSQL(sql, [SYSTEM_CODE, userId]);
    return res.status(200).json({ emojis: result.rows });
  }

  if (req.method === "POST") {
    const { userId, name, dataUrl } = req.body || {};
    if (!await verifySession(userId, getBearerToken(req), SYSTEM_CODE)) return res.status(401).json({ error: "Unauthorized" });
    if (!name || !dataUrl) return res.status(400).json({ error: "name and dataUrl required" });
    if (!dataUrl.startsWith("data:image/")) return res.status(400).json({ error: "Invalid image" });

    const [header, base64Data] = dataUrl.split(",");
    const mimeType = header.match(/data:([^;]+)/)?.[1] || "image/png";
    const buffer = Buffer.from(base64Data, "base64");

    if (buffer.byteLength > MAX_SIZE_BYTES) {
      return res.status(400).json({ error: "Image too large (max 200KB)" });
    }

    // Store image bytes in R2 when configured; otherwise keep the legacy BYTEA path.
    if (r2.isR2Configured()) {
      const ext = EMOJI_EXT_BY_MIME[mimeType.toLowerCase()] || "png";
      const emojiId = uuidv4();
      const key = r2.scopedKey(`emoji/${userId}/${emojiId}.${ext}`);
      await r2.uploadFile(key, buffer, mimeType);

      const sql = await dynamicSql.getSQL(SYSTEM_CODE, "insert_TB_COR_CHAT_CUSTOM_EMOJI", 2);
      const result = await database.executeSQL(sql, [SYSTEM_CODE, userId, name.slice(0, 50), mimeType, key]);
      return res.status(200).json({ id: result.rows[0].id });
    }

    const sql = await dynamicSql.getSQL(SYSTEM_CODE, "insert_TB_COR_CHAT_CUSTOM_EMOJI", 1);
    const result = await database.executeSQL(sql, [SYSTEM_CODE, userId, name.slice(0, 50), mimeType, buffer]);
    return res.status(200).json({ id: result.rows[0].id });
  }

  if (req.method === "DELETE") {
    const { id, userId } = req.query;
    if (!await verifySession(userId, getBearerToken(req), SYSTEM_CODE)) return res.status(401).json({ error: "Unauthorized" });
    if (!id) return res.status(400).json({ error: "id required" });
    const sql = await dynamicSql.getSQL(SYSTEM_CODE, "delete_TB_COR_CHAT_CUSTOM_EMOJI", 1);
    const result = await database.executeSQL(sql, [SYSTEM_CODE, id, userId]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
