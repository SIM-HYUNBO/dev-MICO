import { deploymentSystemCode } from "@/lib/tenantResolver";
"use strict";

import { logger } from "@/components/core/server/winston/logger";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import { runService } from "@/lib/serviceRunner";
import { sendPush } from "@/lib/webPush";
const DEFAULT_TESTER_LINK = "https://play.google.com/apps/testing/kr.co.brunner.app";
// Play 트랙이 실제로 쓰는 소비자 그룹 가입 페이지. 도메인 그룹 자동추가는 Play가 인식하지 못해 제거함.
const DEFAULT_TESTER_GROUP_URL = "https://groups.google.com/g/brunner-tester-group";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getTesterLink = () =>
  (process.env.ANDROID_TESTER_JOIN_URL || process.env.NEXT_PUBLIC_ANDROID_TESTER_JOIN_URL || DEFAULT_TESTER_LINK).trim();

const getGroupJoinUrl = () =>
  (process.env.ANDROID_TESTER_GROUP_URL || process.env.NEXT_PUBLIC_ANDROID_TESTER_GROUP_URL || DEFAULT_TESTER_GROUP_URL).trim();

const executeService = (txnId, jRequest) =>
  runService(txnId, jRequest, async () => {
    switch (jRequest.commandName) {
      case constants.commands.ANDROID_TESTER_REGISTER:
        return registerTester(txnId, jRequest);
      case constants.commands.ANDROID_TESTER_MY_STATUS:
        return getMyStatus(txnId, jRequest);
      case constants.commands.ANDROID_TESTER_ADMIN_LIST:
        return getAdminList(txnId, jRequest);
      case constants.commands.ANDROID_TESTER_SEND_RECOVERY_PUSH:
        return sendRecoveryPush(txnId, jRequest);
      default:
        throw new Error(
          commonFunctions.getResourceByLanguage(
            `SERVER_NOT_SUPPORTED_METHOD`,
            constants.resourceType.message,
            jRequest.languageCode,
          ),
        );
    }
  });

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const getUserRecord = async (systemCode, userId) => {
  if (!userId) return null;
  const sql = await dynamicSql.getSQL(
    systemCode,
    "select_TB_COR_ANDROID_TESTER_USER",
    1,
  );
  const result = await database.executeSQL(sql, [systemCode, userId]);
  return result.rows?.[0] || null;
};

const isTruthyAdmin = (value) => value === true || String(value || "").toUpperCase() === "Y";

const isAdminUserId = async (systemCode, userId) => {
  const envAdmins = (process.env.AIC_ADMIN_USER_IDS || process.env.ADMIN_USER_ID || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (envAdmins.includes(userId)) return true;
  const row = await getUserRecord(systemCode, userId);
  return isTruthyAdmin(row?.admin_flag);
};

const toLowerSet = (items) =>
  new Set(
    (Array.isArray(items) ? items : [])
      .map((v) => String(v || "").trim().toLowerCase())
      .filter(Boolean),
  );

const getRecoveryPushText = (languageCode) => ({
  title: commonFunctions.getResourceByLanguage(
    "ANDROID_TESTER_RECOVERY_PUSH_TITLE",
    constants.resourceType.message,
    languageCode,
  ),
  body: commonFunctions.getResourceByLanguage(
    "ANDROID_TESTER_RECOVERY_PUSH_BODY",
    constants.resourceType.message,
    languageCode,
  ),
});

const registerTester = async (txnId, jRequest) => {
  const jResponse = {};

  try {
    const { systemCode, userId, source, userAgent, email } = jRequest;
    const userRow = await getUserRecord(systemCode, userId);
    // 테스터 이메일은 사용자가 입력한 Play 스토어 Google 계정을 우선 사용한다.
    // (가입 이메일 email_id는 네이버 등 Google 아닌 계정일 수 있어 그룹추가·opt-in이 실패함)
    const testerEmail = normalizeEmail(email) || normalizeEmail(userRow?.email_id);
    const testerName = userRow?.user_name || "";

    if (!userId || !EMAIL_RE.test(testerEmail)) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "A valid Google account email is required.";
      return jResponse;
    }

    const testerLink = getTesterLink();
    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "upsert_TB_COR_ANDROID_TESTER",
      1,
    );
    const result = await database.executeSQL(sql, [
      systemCode,
      userId,
      testerName,
      testerEmail,
      source || "home",
      testerLink,
      userAgent || "",
    ]);

    // 도메인 그룹 자동추가 제거 — Play가 인식하지 못하는 그룹이라 무의미했음.
    // 등록만 DB에 남기고, 클라가 소비자 그룹 가입 페이지 → opt-in으로 안내한다.
    const testerRow = result.rows[0] || null;

    jResponse.data = testerRow;
    jResponse.groupJoinUrl = getGroupJoinUrl();
    jResponse.testerLink = testerLink;
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = commonFunctions.getResourceByLanguage(
      `SUCCESS_FINISHED`,
      constants.resourceType.message,
      jRequest.languageCode,
    );
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const getMyStatus = async (txnId, jRequest) => {
  const jResponse = {};

  try {
    const { systemCode, userId } = jRequest;
    if (!userId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Required field [userId]";
      return jResponse;
    }

    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_ANDROID_TESTER", 1);
    const result = await database.executeSQL(sql, [systemCode, userId]);
    jResponse.data = result.rows[0] || null;
    jResponse.testerLink = getTesterLink();
    jResponse.error_code = constants.errorCode.Success;
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const getAdminList = async (txnId, jRequest) => {
  const jResponse = {};

  try {
    const { systemCode, userId } = jRequest;
    if (!(await isAdminUserId(systemCode, userId))) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Admin only.";
      return jResponse;
    }

    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_ANDROID_TESTER", 2);
    const result = await database.executeSQL(sql, [systemCode]);
    jResponse.data = result.rows;
    jResponse.error_code = constants.errorCode.Success;
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const sendRecoveryPush = async (txnId, jRequest) => {
  const jResponse = {};

  try {
    const {
      systemCode = deploymentSystemCode(),
      userId,
      dryRun = false,
      targetUserIds = [],
      targetEmails = [],
      excludeUserIds = [],
      excludeEmails = [],
      languageCode,
    } = jRequest;
    if (!(await isAdminUserId(systemCode, userId))) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Admin only.";
      return jResponse;
    }

    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_ANDROID_TESTER", 3);
    const result = await database.executeSQL(sql, [systemCode]);
    const targetUserSet = toLowerSet(targetUserIds);
    const targetEmailSet = toLowerSet(targetEmails);
    const excludeUserSet = toLowerSet(excludeUserIds);
    const excludeEmailSet = toLowerSet(excludeEmails);

    const rows = (result.rows || []).filter((row) => {
      const rowUserId = String(row.user_id || "").trim().toLowerCase();
      const rowEmail = String(row.email || "").trim().toLowerCase();
      if (targetUserSet.size > 0 && !targetUserSet.has(rowUserId)) return false;
      if (targetEmailSet.size > 0 && !targetEmailSet.has(rowEmail)) return false;
      if (excludeUserSet.has(rowUserId) || excludeEmailSet.has(rowEmail)) return false;
      return true;
    });

    const targetUsers = new Map();
    rows.forEach((row) => {
      if (!targetUsers.has(row.user_id)) {
        targetUsers.set(row.user_id, {
          userId: row.user_id,
          email: row.email,
          status: row.status,
          subscriptionCount: 0,
        });
      }
      targetUsers.get(row.user_id).subscriptionCount += 1;
    });

    if (dryRun) {
      jResponse.error_code = constants.errorCode.Success;
      jResponse.data = {
        dryRun: true,
        targetUserCount: targetUsers.size,
        subscriptionCount: rows.length,
        targets: [...targetUsers.values()],
      };
      return jResponse;
    }

    const { title, body } = getRecoveryPushText(languageCode);
    const expiredEndpoints = [];
    const failed = [];
    let sent = 0;

    await Promise.all(rows.map(async (row) => {
      try {
        const result = await sendPush(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          {
            title,
            body,
            url: "/",
            badge: 0,
            forceNotification: true,
            sound: "default",
            silent: false,
            ttl: 86400,
            urgency: "high",
          },
        );
        if (result.expired) {
          expiredEndpoints.push({ userId: row.user_id, endpoint: row.endpoint });
        } else {
          sent += 1;
        }
      } catch (e) {
        failed.push({ userId: row.user_id, email: row.email, message: e.message });
      }
    }));

    if (expiredEndpoints.length > 0) {
      const deleteSql = await dynamicSql.getSQL(deploymentSystemCode(), "delete_TB_COR_PUSH_SUBSCRIPTION", 1);
      await Promise.all(expiredEndpoints.map((item) => database.executeSQL(deleteSql, [item.userId, item.endpoint])));
    }

    jResponse.error_code = constants.errorCode.Success;
    jResponse.data = {
      dryRun: false,
      targetUserCount: targetUsers.size,
      subscriptionCount: rows.length,
      sent,
      expired: expiredEndpoints.length,
      failed,
      targets: [...targetUsers.values()],
    };
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

export { executeService };
