import { logger } from "@/components/core/server/winston/logger.js";
import { SCHEMA } from "@/lib/dbSchema.js";
import * as constants from "@/lib/constants.js";
import * as commonFunctions from "@/lib/commonFunctions.js";
import * as database from "./database/database.js";
import { deploymentSystemCode } from "@/lib/tenantResolver.js";
import * as dynamicSql from "./dynamicSql.js";


let dynamicSqlLoadingPromise = null;

const executeService = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    switch (jRequest.commandName) {
      case constants.commands.DYNAMIC_SEQ_SELECT_ALL:
        jResponse = await selectAll(deploymentSystemCode(), txnId, jRequest);
        break;
      case constants.commands.DYNAMIC_SEQ_UPDATE_ONE:
        jResponse = await updateOne(deploymentSystemCode(), txnId, jRequest);
        break;
      case constants.commands.DYNAMIC_SEQ_DELETE_ONE:
        jResponse = await deleteOne(deploymentSystemCode(), txnId, jRequest);
        break;
      default:
        throw new Error(
          commonFunctions.getResourceByLanguage(
            `SERVER_NOT_SUPPORTED_METHOD`,
            constants.resourceType.message,
            jRequest.languageCode,
          ),
        );
    }
  } catch (e) {
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

async function selectAll(systemCode, txnId, jRequest) {
  var jResponse = {};

  try {
    var SQLs = [];

    var sql = await dynamicSql.getSQL(
      systemCode,
      `select_TB_COR_SQL_INFO`,
      1,
    );

    var select_TB_COR_SQL_INFO_01 = await database.executeSQL(sql, [
      systemCode,
    ]);

    if (select_TB_COR_SQL_INFO_01) {
      select_TB_COR_SQL_INFO_01.rows.forEach((row) => {
        SQLs = select_TB_COR_SQL_INFO_01.rows;
      });
      jResponse.data = SQLs;
      jResponse.error_code = constants.errorCode.Success;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `EMPTY_STRING`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
    } else {
      throw new Error(
        commonFunctions.getResourceByLanguage(
          `SERVER_SQL_NOT_LOADED`,
          constants.resourceType.message,
          jRequest.languageCode,
        ),
      );
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
}

async function updateOne(systemCode, txnId, jRequest) {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;

    if (!jRequest.userId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [userId]`;
      return jResponse;
    }
    if (!deploymentSystemCode()) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [systemCode]`;
      return jResponse;
    }

    if (!jRequest.sqlName) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [sqlName]`;
      return jResponse;
    }

    if (!jRequest.sqlSeq) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [sqlSeq]`;
      return jResponse;
    }

    if (!jRequest.sqlContent) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [sqlContent]`;
      return jResponse;
    }

    var sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      `select_TB_COR_SQL_INFO`,
      2,
    );
    var select_TB_COR_SQL_INFO_02 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.sqlName,
      jRequest.sqlSeq,
    ]);

    if (
      jRequest.action === "Update" &&
      select_TB_COR_SQL_INFO_02.rowCount <= 0
    ) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = `The SQL not used.`;
      return jResponse;
    }

    if (
      jRequest.action === "Create" &&
      select_TB_COR_SQL_INFO_02.rowCount > 0
    ) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = `The SQL already exist.`;
      return jResponse;
    }

    if (jRequest.action === "Update") {
      sql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        `update_TB_COR_SQL_INFO`,
        1,
      );

      var update_TB_COR_SQL_INFO_01 = await database.executeSQL(sql, [
        jRequest.sqlContent,
        jRequest.userId,
        deploymentSystemCode(),
        jRequest.sqlName,
        jRequest.sqlSeq,
      ]);

      if (update_TB_COR_SQL_INFO_01.rowCount == 1) {
        setSQL(
          deploymentSystemCode(),
          jRequest.sqlName,
          jRequest.sqlSeq,
          jRequest.sqlContent,
        );

        jResponse.error_code = constants.errorCode.Success;
        jResponse.error_message = commonFunctions.getResourceByLanguage(
          `EMPTY_STRING`,
          constants.resourceType.message,
          jRequest.languageCode,
        );
      } else {
        jResponse.error_code = constants.errorCode.DBCUDError;
        jResponse.error_message = `Failed to update dynamicSql.\n`;
      }
    } else if (jRequest.action === "Create") {
      sql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        `insert_TB_COR_SQL_INFO`,
        1,
      );

      var insert_TB_COR_SQL_INFO_01 = await database.executeSQL(sql, [
        deploymentSystemCode(),
        jRequest.sqlName,
        jRequest.sqlSeq,
        jRequest.sqlContent,
        jRequest.userId,
      ]);

      if (insert_TB_COR_SQL_INFO_01.rowCount == 1) {
        jResponse.error_code = constants.errorCode.Success;
        jResponse.error_message = commonFunctions.getResourceByLanguage(
          `EMPTY_STRING`,
          constants.resourceType.message,
          jRequest.languageCode,
        );
      } else {
        jResponse.error_code = constants.errorCode.DBCUDError;
        jResponse.error_message = `Failed to create dynamicSql.\n`;
      }
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
}

async function deleteOne(systemCode, txnId, jRequest) {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;

    if (!jRequest.userId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [userId`;
      return jResponse;
    }
    if (!deploymentSystemCode()) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [systemCode]`;
      return jResponse;
    }

    if (!jRequest.sqlName) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [sqlName]`;
      return jResponse;
    }

    if (!jRequest.sqlSeq) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [sqlSeq]`;
      return jResponse;
    }

    var sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      `select_TB_COR_SQL_INFO`,
      2,
    );

    var select_TB_COR_SQL_INFO_02 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.sqlName,
      jRequest.sqlSeq,
    ]);

    if (select_TB_COR_SQL_INFO_02.rowCount <= 0) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = `The SQL not exist.`;
      return jResponse;
    }

    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      `delete_TB_COR_SQL_INFO`,
      1,
    );

    var delete_TB_COR_SQL_INFO_01 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.sqlName,
      jRequest.sqlSeq,
    ]);

    if (delete_TB_COR_SQL_INFO_01.rowCount == 1) {
      deleteSQL(
        deploymentSystemCode(),
        jRequest.sqlName,
        jRequest.sqlSeq,
        jRequest.sqlContent,
      );

      jResponse.error_code = constants.errorCode.Success;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `EMPTY_STRING`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
    } else {
      jResponse.error_code = constants.errorCode.DBCUDError;
      jResponse.error_message = `Failed to delete dynamicSql.\n`;
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
}

async function loadAll() {
  // 이미 로딩했으면 로딩 안하고 성공 리턴
  if (process && process.dynamicSql && process.dynamicSql.size > 0) {
    return process.dynamicSql;
  }

  logger.warn(`Start loading service queries.\n`);

  var loadedSQLs = new Map();

  var sql = `
      SELECT *
        FROM ${SCHEMA}.TB_COR_SQL_INFO
       ORDER BY SYSTEM_CODE, SQL_NAME, SQL_SEQ, SQL_CONTENT
       ;
    `;

  const sql_result = await database.executeSQL(sql, []);

  if (sql_result && sql_result.rowCount > 0) {
    sql_result.rows.forEach((row) => {
      loadedSQLs.set(
        `${row.system_code}_${row.sql_name}_${row.sql_seq}`,
        row.sql_content,
      );
    });
    process.dynamicSql = loadedSQLs;
    return process.dynamicSql;
  }

  throw new Error(
    commonFunctions.getResourceByLanguage(
      `SERVER_SQL_NOT_LOADED`,
      constants.resourceType.message,
      constants.languageCode.en_US,
    ),
  );
}

async function ensureLoaded() {
  if (process.dynamicSql && process.dynamicSql.size > 0) {
    return process.dynamicSql;
  }

  if (!dynamicSqlLoadingPromise) {
    dynamicSqlLoadingPromise = loadAll().finally(() => {
      dynamicSqlLoadingPromise = null;
    });
  }

  await dynamicSqlLoadingPromise;

  if (!process.dynamicSql || process.dynamicSql.size <= 0) {
    throw new Error(
      commonFunctions.getResourceByLanguage(
        `SERVER_SQL_NOT_LOADED`,
        constants.resourceType.message,
        constants.languageCode.en_US,
      ),
    );
  }

  return process.dynamicSql;
}

const getSQL = async (systemCode, sqlName, sqlSeq) => {
  try {
    await ensureLoaded();
    var sql = process.dynamicSql.get(`${systemCode}_${sqlName}_${sqlSeq}`);
    if (!sql) {
      // 이름을 남기지 않으면 화면에는 "Database operation failed." 만 뜨고,
      // 어느 SQL 이 빠졌는지 알 길이 없어 시드를 처음부터 뒤져야 한다.
      // 사용자에게 보이는 문구는 그대로 두고 서버 로그에만 적는다.
      logger.error(
        `[dynamicSql] 등록되지 않은 SQL: ${sqlName} (seq ${sqlSeq}, systemCode ${systemCode}). ` +
          `TB_COR_SQL_INFO 에 이 이름이 있는지 확인이 필요하다. 현재 로드된 SQL ${process.dynamicSql?.size ?? 0}건.`,
      );
      throw new Error(
        commonFunctions.getResourceByLanguage(
          `DATABASE_FAILED`,
          constants.resourceType.message,
          constants.languageCode.en_US,
        ),
      );
    }
    return sql;
  } catch (e) {
    throw e;
  }
};

const setSQL = async (systemCode, sqlName, sqlSeq, sqlContent) => {
  try {
    await ensureLoaded();
    var sql = process.dynamicSql.set(
      `${systemCode}_${sqlName}_${sqlSeq}`,
      sqlContent,
    );
    return sql;
  } catch (e) {
    throw e;
  }
};

const deleteSQL = async (systemCode, sqlName, sqlSeq) => {
  try {
    await ensureLoaded();
    var sql = process.dynamicSql.delete(`${systemCode}_${sqlName}_${sqlSeq}`);
    return sql;
  } catch (e) {
    throw e;
  }
};

export { executeService, getSQL, loadAll };
