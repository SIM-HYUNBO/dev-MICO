"use strict";

import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import { initializeServer, waitUntilReady } from "@/pages/api/backendServer";
import { sendPush, getPushConfigError, rememberPushOrigin } from "@/lib/webPush";
import { deploymentSystemCode } from "@/lib/tenantResolver";

function summarizeEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    const tail = endpoint.slice(-16);
    const provider = url.hostname.includes("web.push.apple.com") ? "apple" : url.hostname;
    return `${provider}:${tail}`;
  } catch {
    return `unknown:${String(endpoint).slice(-16)}`;
  }
}

export default async function handler(req, res) {
  let endpointLabel = "unknown";
  try {
    await initializeServer();
    await waitUntilReady();
    // 전용 환경변수가 없어도 VAPID subject 를 만들 수 있게 자기 origin 을 기억해 둔다.
    rememberPushOrigin(req);

    if (req.method !== "POST") {
      res.status(405).end();
      return;
    }

    const { userId, endpoint } = req.body || {};
    if (!userId || !endpoint) {
      res.status(400).json({ error: "userId and endpoint required" });
      return;
    }

    // 서버 설정이 깨져 있으면 푸시 서비스는 401/403 만 주고 이유를 안 준다.
    // 서버가 먼저 알 수 있는 원인은 발송 전에 이름으로 돌려줘 헛발송을 막는다.
    const configError = getPushConfigError();
    if (configError) {
      console.error(`[push test] server push config invalid: ${configError}`);
      res.status(500).json({ error: `server push config invalid (${configError})`, code: "PUSH_CONFIG", configError });
      return;
    }

    const systemCode = deploymentSystemCode();
    const selectSql = await dynamicSql.getSQL(
      systemCode,
      "select_TB_COR_PUSH_SUBSCRIPTION",
      1,
    );
    const result = await database.executeSQL(selectSql, [systemCode, [userId]]);
    const subscription = result.rows.find((row) => row.endpoint === endpoint);
    if (!subscription) {
      res.status(404).json({ error: "Current device subscription is not registered on server", code: "PUSH_NOT_REGISTERED" });
      return;
    }
    endpointLabel = summarizeEndpoint(subscription.endpoint);

    const pushResult = await sendPush(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      {
        title: "Brunner 테스트 알림",
        body: "현재 기기 푸시 테스트",
        url: "/",
        badge: 0,
        forceNotification: true,
        roomId: null,
        sound: "default",
        silent: false,
        ttl: 60,
        urgency: "high",
      },
    );

    if (pushResult.expired) {
      console.warn(`[push test] expired subscription user=${userId} endpoint=${endpointLabel} status=${pushResult.statusCode || "unknown"}`);
      res.status(410).json({
        error: "Current device subscription is expired",
        code: "PUSH_EXPIRED",
        statusCode: pushResult.statusCode || null,
      });
      return;
    }

    console.info(`[push test] sent to user=${userId} endpoint=${endpointLabel} status=${pushResult.statusCode || "unknown"}`);
    res.status(200).json({ ok: true, endpoint: endpointLabel, statusCode: pushResult.statusCode || null });
  } catch (error) {
    // 푸시 서비스 거절은 서버 장애가 아니라 상류(APNs/FCM) 거절이므로 502 로 구분하고,
    // 상태코드와 서비스가 준 사유를 그대로 실어 화면·로그 양쪽에서 원인을 좁힐 수 있게 한다.
    if (error.code === "PUSH_REJECTED") {
      console.warn(`[push test] rejected endpoint=${endpointLabel} status=${error.statusCode} reason=${error.reason || "none"}`);
      res.status(502).json({
        error: error.message,
        code: "PUSH_REJECTED",
        statusCode: error.statusCode,
        reason: error.reason || null,
      });
      return;
    }
    if (error.code === "PUSH_CONFIG") {
      console.error(`[push test] ${error.message}`);
      res.status(500).json({ error: error.message, code: "PUSH_CONFIG", configError: error.configError });
      return;
    }
    console.error(`[push test] ${error.message}`);
    res.status(500).json({ error: error.message });
  }
}
