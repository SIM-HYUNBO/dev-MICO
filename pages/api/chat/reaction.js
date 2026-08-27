"use strict";

import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import * as constants from "@/lib/constants";
import { deploymentSystemCode } from "@/lib/tenantResolver";


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
  } catch { return false; }
}

async function verifyMembership(userId, roomId, SYSTEM_CODE) {
  if (!userId || !roomId) return false;
  try {
    const sql = await dynamicSql.getSQL(SYSTEM_CODE, "select_TB_COR_CHATROOM_MEMBERSHIP", 1);
    const result = await database.executeSQL(sql, [SYSTEM_CODE, roomId, userId]);
    return result.rowCount > 0;
  } catch { return false; }
}

async function verifyMessageInRoom(roomId, messageId, SYSTEM_CODE) {
  try {
    const sql = await dynamicSql.getSQL(SYSTEM_CODE, "select_TB_COR_CHAT_MSG_BY_ROOM", 1);
    const result = await database.executeSQL(sql, [SYSTEM_CODE, roomId, messageId]);
    return result.rowCount > 0;
  } catch { return false; }
}

export default async function handler(req, res) {
  // ?뚮꼳?몃뒗 ?쒕쾭媛 ?붿껌?쇰줈遺???뺥븳??
  const SYSTEM_CODE = deploymentSystemCode();
  // GET: load reactions for message ids after session and room membership checks.
  if (req.method === "GET") {
    const { userId, roomId, messageIds } = req.query;
    if (!await verifySession(userId, getBearerToken(req), SYSTEM_CODE)) return res.status(401).json({ error: "Unauthorized" });
    if (!roomId || !messageIds) return res.status(200).json({ reactions: {} });
    if (!await verifyMembership(userId, roomId, SYSTEM_CODE)) return res.status(403).json({ error: "Forbidden" });

    const ids = String(messageIds).split(",").map(Number).filter(Boolean);
    if (!ids.length) return res.status(200).json({ reactions: {} });

    const sql = await dynamicSql.getSQL(SYSTEM_CODE, "select_TB_COR_CHAT_REACTION_BY_MESSAGES", 1);
    const result = await database.executeSQL(sql, [SYSTEM_CODE, ids, roomId]);

    const reactions = {};
    for (const row of result.rows) {
      const mid = String(row.message_id);
      if (!reactions[mid]) reactions[mid] = {};
      if (!reactions[mid][row.emoji]) reactions[mid][row.emoji] = [];
      reactions[mid][row.emoji].push(row.user_id);
    }
    return res.status(200).json({ reactions });
  }

  // POST: add a reaction after membership and message-room checks.
  if (req.method === "POST") {
    const { userId, roomId, messageId, emoji } = req.body || {};
    if (!await verifySession(userId, getBearerToken(req), SYSTEM_CODE)) return res.status(401).json({ error: "Unauthorized" });
    if (!messageId || !emoji || !roomId) return res.status(400).json({ error: "roomId, messageId and emoji required" });
    if (!await verifyMembership(userId, roomId, SYSTEM_CODE)) return res.status(403).json({ error: "Forbidden" });
    if (!await verifyMessageInRoom(roomId, messageId, SYSTEM_CODE)) return res.status(403).json({ error: "Forbidden" });

    const sql = await dynamicSql.getSQL(SYSTEM_CODE, "upsert_TB_COR_CHAT_REACTION", 1);
    await database.executeSQL(sql, [SYSTEM_CODE, messageId, userId, emoji]);
    return res.status(200).json({ ok: true });
  }

  // DELETE: remove a reaction after membership and message-room checks.
  if (req.method === "DELETE") {
    const { userId, roomId, messageId, emoji } = req.query;
    if (!await verifySession(userId, getBearerToken(req), SYSTEM_CODE)) return res.status(401).json({ error: "Unauthorized" });
    if (!messageId || !emoji || !roomId) return res.status(400).json({ error: "roomId, messageId and emoji required" });
    if (!await verifyMembership(userId, roomId, SYSTEM_CODE)) return res.status(403).json({ error: "Forbidden" });
    if (!await verifyMessageInRoom(roomId, messageId, SYSTEM_CODE)) return res.status(403).json({ error: "Forbidden" });

    const sql = await dynamicSql.getSQL(SYSTEM_CODE, "delete_TB_COR_CHAT_REACTION", 1);
    await database.executeSQL(sql, [SYSTEM_CODE, messageId, userId, emoji]);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
