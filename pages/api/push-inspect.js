"use strict";

// 푸시 구독 진단 — 특정 유저에게 서버가 어떤 구독을 몇 개 들고 있는지(제공자·등록시각) 확인한다.
// "201인데 안 온다" 류를 기기 밖(서버)에서 데이터로 보기 위한 진단 전용 엔드포인트.
// 접근: 본인(자기 구독) 또는 관리자만. endpoint는 마스킹해서 반환한다.
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import { initializeServer, waitUntilReady } from "@/pages/api/backendServer";
import { deploymentSystemCode } from "@/lib/tenantResolver";

const providerOf = (endpoint) => {
  try {
    const host = new URL(endpoint).hostname;
    if (host.includes("web.push.apple.com")) return "apple";
    if (host.includes("fcm.googleapis.com") || host.includes("android")) return "fcm";
    if (host.includes("mozilla")) return "mozilla";
    return host;
  } catch { return "unknown"; }
};
const maskEndpoint = (endpoint) => `${providerOf(endpoint)}:…${String(endpoint).slice(-12)}`;

const isAdmin = async (systemCode, userId) => {
  if (!userId) return false;
  const envAdmins = (process.env.AIC_ADMIN_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (envAdmins.includes(userId)) return true;
  try {
    const sql = await dynamicSql.getSQL(systemCode, "select_TB_COR_USER_MST", 6);
    const r = await database.executeSQL(sql, [systemCode, userId]);
    const flag = r.rows?.[0]?.admin_flag;
    return flag === true || String(flag).toUpperCase() === "Y" || String(flag) === "true";
  } catch { return false; }
};

export default async function handler(req, res) {
  try {
    await initializeServer();
    await waitUntilReady();
    if (req.method !== "POST") { res.status(405).end(); return; }

    const systemCode = deploymentSystemCode();
    const { adminUserId, targetUserId } = req.body || {};
    const target = targetUserId || adminUserId;
    if (!adminUserId || !target) {
      res.status(400).json({ error: "adminUserId and targetUserId required" });
      return;
    }
    // 본인 조회이거나 관리자만 허용
    if (adminUserId !== target && !(await isAdmin(systemCode, adminUserId))) {
      res.status(403).json({ error: "not allowed" });
      return;
    }

    // 즉시 정리: 누적된 구독을 최근 5개만 남기고 삭제(회전 누적 청소).
    let pruned = 0;
    if (req.body?.prune === true) {
      const before = (await database.executeSQL(await dynamicSql.getSQL(systemCode, "select_TB_COR_PUSH_SUBSCRIPTION", 3), [systemCode, target])).rows?.length || 0;
      const pruneSql = await dynamicSql.getSQL(systemCode, "delete_TB_COR_PUSH_SUBSCRIPTION", 3);
      await database.executeSQL(pruneSql, [systemCode, target]);
      const after = (await database.executeSQL(await dynamicSql.getSQL(systemCode, "select_TB_COR_PUSH_SUBSCRIPTION", 3), [systemCode, target])).rows?.length || 0;
      pruned = before - after;
    }

    const sql = await dynamicSql.getSQL(systemCode, "select_TB_COR_PUSH_SUBSCRIPTION", 3);
    const r = await database.executeSQL(sql, [systemCode, target]);
    const rows = r.rows || [];
    const subscriptions = rows.map((x) => ({
      endpoint: maskEndpoint(x.endpoint),
      provider: providerOf(x.endpoint),
      createdAt: x.created_at,
    }));
    const byProvider = subscriptions.reduce((acc, s) => { acc[s.provider] = (acc[s.provider] || 0) + 1; return acc; }, {});
    res.status(200).json({ ok: true, userId: target, pruned, count: subscriptions.length, byProvider, subscriptions });
  } catch (e) {
    console.error(`[push-inspect] ${e.message}`);
    res.status(500).json({ error: e.message });
  }
}
