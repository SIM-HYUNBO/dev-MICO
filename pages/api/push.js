"use strict";

import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import { initializeServer, waitUntilReady } from "@/pages/api/backendServer";
import { rememberPushOrigin } from "@/lib/webPush";
import { deploymentSystemCode } from "@/lib/tenantResolver";

export default async function handler(req, res) {
  // 테넌트는 서버가 요청으로부터 정한다.
  const SYSTEM_CODE = deploymentSystemCode();
  try {
    await initializeServer();
    await waitUntilReady();
    // 발송 경로(cron 등)에는 요청이 없다 — 구독 시점에 자기 origin 을 기억해 둔다.
    rememberPushOrigin(req);

    if (req.method === "POST") {
      const { userId, subscription } = req.body;
      if (!userId || !subscription?.endpoint) {
        return res.status(400).json({ error: "userId and subscription required" });
      }
      try {
        const deleteEndpointSql = await dynamicSql.getSQL(SYSTEM_CODE, "delete_TB_COR_PUSH_SUBSCRIPTION", 2);
        await database.executeSQL(deleteEndpointSql, [subscription.endpoint]);
      } catch (e) {
        console.warn("[push API] endpoint cleanup skipped:", e.message);
      }
      const sql = await dynamicSql.getSQL(SYSTEM_CODE, "insert_TB_COR_PUSH_SUBSCRIPTION", 1);
      // 구독은 이 배포(서비스)의 것으로 저장한다 — 테넌트를 안 넣으면 같은 스키마를 쓰는
      // 다른 서비스가 이 기기를 자기 구독으로 읽어 알림이 양쪽에서 울린다.
      await database.executeSQL(sql, [
        SYSTEM_CODE,
        userId,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
      ]);
      // 유저당 최근 5개만 유지 — 회전으로 누적된 죽은 구독이 APNs throttle을 유발하는 걸 막는다.
      try {
        const pruneSql = await dynamicSql.getSQL(SYSTEM_CODE, "delete_TB_COR_PUSH_SUBSCRIPTION", 3);
        await database.executeSQL(pruneSql, [SYSTEM_CODE, userId]);
      } catch (e) {
        console.warn("[push API] prune skipped:", e.message);
      }
      return res.status(200).json({ ok: true });
    }

    // 구독 회전(pushsubscriptionchange): SW엔 userId가 없으므로 옛 endpoint로 소유자를 찾아 새 구독으로 이관한다.
    // 이걸 안 하면 iOS 등에서 구독이 회전된 기기는 조용히 푸시가 끊긴다.
    if (req.method === "PUT") {
      const { oldEndpoint, subscription } = req.body;
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({ error: "subscription required" });
      }
      let userId = null;
      if (oldEndpoint) {
        try {
          const findSql = await dynamicSql.getSQL(SYSTEM_CODE, "select_TB_COR_PUSH_SUBSCRIPTION", 2);
          const found = await database.executeSQL(findSql, [oldEndpoint]);
          userId = found.rows?.[0]?.user_id || null;
        } catch (e) {
          console.warn("[push API] migrate lookup skipped:", e.message);
        }
      }
      // 소유자를 못 찾으면 이관할 대상이 없다(다음 앱 실행 시 userId와 함께 재등록된다).
      if (!userId) return res.status(200).json({ ok: true, migrated: false });

      try {
        const delOld = await dynamicSql.getSQL(SYSTEM_CODE, "delete_TB_COR_PUSH_SUBSCRIPTION", 2);
        if (oldEndpoint) await database.executeSQL(delOld, [oldEndpoint]);
        await database.executeSQL(delOld, [subscription.endpoint]); // 새 endpoint가 다른 유저에 붙어있으면 정리
      } catch (e) {
        console.warn("[push API] migrate cleanup skipped:", e.message);
      }
      const sql = await dynamicSql.getSQL(SYSTEM_CODE, "insert_TB_COR_PUSH_SUBSCRIPTION", 1);
      await database.executeSQL(sql, [SYSTEM_CODE, userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]);
      try {
        const pruneSql = await dynamicSql.getSQL(SYSTEM_CODE, "delete_TB_COR_PUSH_SUBSCRIPTION", 3);
        await database.executeSQL(pruneSql, [SYSTEM_CODE, userId]);
      } catch (e) {
        console.warn("[push API] prune skipped:", e.message);
      }
      return res.status(200).json({ ok: true, migrated: true });
    }

    if (req.method === "DELETE") {
      const { userId, endpoint } = req.body;
      if (!userId || !endpoint) {
        return res.status(400).json({ error: "userId and endpoint required" });
      }
      const sql = await dynamicSql.getSQL(SYSTEM_CODE, "delete_TB_COR_PUSH_SUBSCRIPTION", 1);
      await database.executeSQL(sql, [userId, endpoint]);
      return res.status(200).json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    console.error("[push API]", e.message);
    res.status(500).json({ error: e.message });
  }
}
