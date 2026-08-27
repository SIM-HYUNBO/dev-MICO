import { deploymentSystemCode } from "@/lib/tenantResolver";
import { logger } from "@/components/core/server/winston/logger";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";

const executeService = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    switch (jRequest.commandName) {
      case constants.commands.TXN_HISTORY_SELECT_ALL:
        jResponse = await selectAll(txnId, jRequest);
        break;
      default:
        throw new Error(
          commonFunctions.getResourceByLanguage(
            `SERVER_NOT_SUPPORTED_METHOD`,
            constants.resourceType.message,
            jRequest.languageCode,
          ),
        );
        break;
    }
  } catch (e) {
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
    logger.error(`message:${e.message}\n stack:${e.stack}\n`);
  } finally {
    return jResponse;
  }
};

const selectAll = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;
    jResponse.userId = jRequest.userId;

    if (!deploymentSystemCode()) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [systemCode].`;
      return jResponse;
    }

    if (!jRequest.userId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [userId]`;
      return jResponse;
    }

    var sql = null;
    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      `select_TB_COR_USER_MST`,
      2,
    );

    var select_TB_COR_USER_MST_02 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.userId,
    ]);

    if (select_TB_COR_USER_MST_02.rowCount != 1) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = `The user not exist.`;
      return jResponse;
    }

    if (!select_TB_COR_USER_MST_02.rows[0].admin_flag) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `NO_PERMISSION`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
      return jResponse;
    }

    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      `select_TB_COR_TXN_HIST`,
      1,
    );

    var select_TB_COR_TXN_HIST_01 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.keyword,
    ]);

    jResponse.data = select_TB_COR_TXN_HIST_01.rows;

    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = commonFunctions.getResourceByLanguage(
      `EMPTY_STRING`,
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

/**
 * 트랜잭션 로그 비동기 저장
 */
export const saveTxnHistoryAsync = (
  remoteIp,
  jRequest,
  jResponse,
) => {
  void (async () => {
    try {
      // 1️⃣ 오래된 트랜잭션 로그 삭제
      // 2️⃣ 요청/응답 데이터 축소
      const reducedRequest = {
        commandName: jRequest.commandName,
        userId: jRequest.userId,
        timestamp: jRequest.timestamp,
      };
      const reducedResponse = {
        durationMs: jResponse._durationMs,
        ...(jResponse._exception != null && {
          exception: jResponse._exception,
        }),
      };

      // 3️⃣ 안전한 JSON 변환
      const safeStringify = (obj) => {
        const seen = new WeakSet();
        return JSON.stringify(obj, (key, value) => {
          if (typeof value === "object" && value !== null) {
            if (seen.has(value)) return "[Circular]";
            seen.add(value);
          }
          return value;
        });
      };

      // 4️⃣ 트랜잭션 히스토리 저장
      const insertSql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "insert_TB_COR_TXN_HIST",
        1,
      );

      await database.executeSQL(insertSql, [
        deploymentSystemCode(),
        jRequest._txnId,
        remoteIp,
        safeStringify(reducedRequest),
        safeStringify(reducedResponse),
      ]);
    } catch (e) {
      logger.error(
        `${commonFunctions.getResourceByLanguage(
          `FAILED_TO_SAVE_TXN_HISTORY`,
          constants.resourceType.message,
          jRequest.languageCode,
        )}: ${e}`,
      );
    }
  })();
};

export { executeService };
