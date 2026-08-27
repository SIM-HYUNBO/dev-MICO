"use strict";

import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import * as constants from "@/lib/constants";
import { decrypt } from "@/lib/chatEncryption";
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
  try {
    const sql = await dynamicSql.getSQL(SYSTEM_CODE, "select_TB_COR_CHATROOM_MEMBERSHIP", 1);
    const result = await database.executeSQL(sql, [SYSTEM_CODE, roomId, userId]);
    return result.rowCount > 0;
  } catch { return false; }
}

export default async function handler(req, res) {
  // The server resolves the tenant from the request.
  const SYSTEM_CODE = deploymentSystemCode();
  if (req.method !== "GET") return res.status(405).end();

  const { userId, roomId, query } = req.query;
  if (!await verifySession(userId, getBearerToken(req), SYSTEM_CODE)) return res.status(401).json({ error: "Unauthorized" });
  if (!roomId || !query?.trim()) return res.status(200).json({ results: [] });
  if (!await verifyMembership(userId, roomId, SYSTEM_CODE)) return res.status(403).json({ error: "Forbidden" });

  const keyword = query.trim().slice(0, 100).toLowerCase();
  try {
    // Messages are encrypted at rest, so fetch then decrypt and filter.
    const sql = await dynamicSql.getSQL(SYSTEM_CODE, "select_TB_COR_CHAT_MSG_SEARCH", 1);
    const result = await database.executeSQL(sql, [SYSTEM_CODE, roomId]);

    const results = result.rows
      .map((r) => {
        const plain = decrypt(r.message);
        return { ...r, plain };
      })
      // sec: messages are client E2EE and cannot be searched server-side.
      .filter((r) => r.plain && !r.plain.startsWith("sec:") && r.plain.toLowerCase().includes(keyword))
      .slice(0, 50)
      .map((r) => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        message: r.plain,
        time: r.created_at,
      }));

    return res.status(200).json({ results });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Search failed" });
  }
}
