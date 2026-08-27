import { deploymentSystemCode } from "@/lib/tenantResolver";
import { logger } from "@/components/core/server/winston/logger";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";

// 대시보드/사용자목록 집계에서 제외할 테스트 계정.
// 원칙: 테스트 계정은 `__xxx__` 네이밍 컨벤션을 따르며 SQL에서 패턴으로 자동 제외한다.
// (하드코딩 목록 없음.) 컨벤션에 안 맞는 예외만 환경변수(USER_ACTIVITY_EXCLUDED_USERS,
// 콤마구분)로 추가 제외할 수 있다. 미가입 사용자 자체는 남기되 제외 대상만 집계에서 빠진다.
const excludedUsersCsv = () =>
  (process.env.USER_ACTIVITY_EXCLUDED_USERS || "")
    .split(",").map((s) => s.trim()).filter(Boolean).join(",");

const ACTIVITY_LABEL_BY_PREFIX = {
  chatroom: "chat",
  openchat: "chat",
  friend: "friend",
  schedule: "schedule",
  stockMarket: "stock",
  meetingRoom: "ai_meeting",
  edocDocument: "document",
  edocCustom: "document",
  edocComponentTemplate: "document",
  postInfo: "board",
  postCommentInfo: "board",
  aiContent: "ai_studio",
  game: "game",
  complaint: "complaint",
  dynamicSql: "admin",
  txnHistory: "admin",
  userActivity: "admin",
  security: "account",
  androidTester: "android_tester",
};

const executeService = async (txnId, jRequest) => {
  let jResponse = {};

  try {
    switch (jRequest.commandName) {
      case constants.commands.USER_ACTIVITY_DASHBOARD:
        jResponse = await selectDashboard(jRequest);
        break;
      case constants.commands.USER_ACTIVITY_USER_LIST:
        jResponse = await selectUserList(jRequest);
        break;
      default:
        throw new Error(
          commonFunctions.getResourceByLanguage(
            "SERVER_NOT_SUPPORTED_METHOD",
            constants.resourceType.message,
            jRequest.languageCode,
          ),
        );
    }
  } catch (e) {
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
    logger.error(`message:${e.message}\n stack:${e.stack}\n`);
  }

  return jResponse;
};

const assertAdmin = async (jRequest) => {
  if (!deploymentSystemCode()) {
    return {
      error_code: constants.errorCode.ServerValidationError,
      error_message: `${commonFunctions.getResourceByLanguage(
        "REQUIRED_FIELD",
        constants.resourceType.message,
        jRequest.languageCode,
      )} [systemCode].`,
    };
  }

  if (!jRequest.userId) {
    return {
      error_code: constants.errorCode.ServerValidationError,
      error_message: `${commonFunctions.getResourceByLanguage(
        "REQUIRED_FIELD",
        constants.resourceType.message,
        jRequest.languageCode,
      )} [userId].`,
    };
  }

  const sql = await dynamicSql.getSQL(
    deploymentSystemCode(),
    "select_TB_COR_USER_MST",
    2,
  );
  const result = await database.executeSQL(sql, [
    deploymentSystemCode(),
    jRequest.userId,
  ]);

  if (result.rowCount !== 1) {
    return {
      error_code: constants.errorCode.DBValidationError,
      error_message: "The user not exist.",
    };
  }

  if (!result.rows[0].admin_flag) {
    return {
      error_code: constants.errorCode.DBValidationError,
      error_message: commonFunctions.getResourceByLanguage(
        "NO_PERMISSION",
        constants.resourceType.message,
        jRequest.languageCode,
      ),
    };
  }

  return null;
};

const selectDashboard = async (jRequest) => {
  let jResponse = {};

  try {
    const adminError = await assertAdmin(jRequest);
    if (adminError) return adminError;

    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_USER_ACTIVITY_DASHBOARD",
      1,
    );
    const result = await database.executeSQL(sql, [deploymentSystemCode(), excludedUsersCsv()]);

    const data = result.rows[0] || {};
    jResponse.commandName = jRequest.commandName;
    jResponse.userId = jRequest.userId;
    jResponse.data = data;
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = commonFunctions.getResourceByLanguage(
      "EMPTY_STRING",
      constants.resourceType.message,
      jRequest.languageCode,
    );
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  }

  return jResponse;
};

const selectUserList = async (jRequest) => {
  let jResponse = {};
  try {
    const adminError = await assertAdmin(jRequest);
    if (adminError) return adminError;

    const days = Number(jRequest.days ?? 0);
    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_USER_ACTIVITY_USER_LIST",
      1,
    );
    const result = await database.executeSQL(sql, [deploymentSystemCode(), days, excludedUsersCsv()]);

    jResponse.commandName = jRequest.commandName;
    jResponse.userId = jRequest.userId;
    jResponse.users = result.rows;
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = commonFunctions.getResourceByLanguage(
      "EMPTY_STRING",
      constants.resourceType.message,
      jRequest.languageCode,
    );
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  }
  return jResponse;
};

export const getActivityType = (commandName = "") => {
  const prefix = String(commandName).split(".")[0];
  // 매핑되지 않은 극소수만 미분류(unknown)로 — 알려진 기능은 모두 위에서 분류된다
  return ACTIVITY_LABEL_BY_PREFIX[prefix] || "unknown";
};

export const saveUserActivityAsync = (jRequest) => {
  if (!jRequest?.systemCode || !jRequest?.userId || !jRequest?.commandName) return;
  if (jRequest.commandName === constants.commands.USER_ACTIVITY_DASHBOARD) return;
  if (jRequest.userId === "system") return;

  void (async () => {
    try {
      const sql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "upsert_TB_COR_USER_ACTIVITY_LOG",
        1,
      );
      await database.executeSQL(sql, [
        deploymentSystemCode(),
        jRequest.userId,
        getActivityType(jRequest.commandName),
        jRequest.commandName,
      ]);
    } catch (e) {
      logger.error(`Failed to save user activity: ${e.message || e}`);
    }
  })();
};

export { executeService };
