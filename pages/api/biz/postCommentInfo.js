import { deploymentSystemCode } from "@/lib/tenantResolver";
import { logger } from "@/components/core/server/winston/logger";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as database from "./database/database";
import * as dynamicSql from "./dynamicSql";

const executeService = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    switch (jRequest.commandName) {
      case constants.commands.POST_COMMENT_INFO_INSERT_ONE:
        jResponse = await insertOne(txnId, jRequest);
        break;
      case constants.commands.POST_COMMENT_INFO_UPDATE_ONE:
        jResponse = await updateOne(txnId, jRequest);
        break;
      case constants.commands.POST_COMMENT_INFO_DELETE_ONE:
        jResponse = await deleteOne(txnId, jRequest);
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

const insertOne = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;
    var coommentId = commonFunctions.generateUUID();
    var sql = null;
    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "insert_TB_COR_POST_COMMENT_INFO",
      1,
    );
    var insert_TB_COR_POST_COMMENT_INFO_01 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.commentInfo.postId,
      coommentId,
      jRequest.commentInfo.content,
      jRequest.commentInfo.userId,
    ]);

    if (insert_TB_COR_POST_COMMENT_INFO_01.rowCount === 1) {
      sql = null;
      sql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "select_TB_COR_POST_COMMENT_INFO",
        2,
      );
      var select_TB_COR_POST_COMMENT_INFO_02 = await database.executeSQL(sql, [
        deploymentSystemCode(),
        jRequest.commentInfo.postId,
        coommentId,
      ]);
      jResponse.commentInfo = select_TB_COR_POST_COMMENT_INFO_02.rows[0];

      jResponse.error_code = constants.errorCode.Success;
      jResponse.error_message =
        commonFunctions.getResourceByLanguage(`EMPTY_STRING`);
    } else {
      jResponse.error_code = constants.errorCode.DBCUDError;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `FAILED_TO_INSERT_DATA`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const updateOne = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;

    if (!jRequest.commentInfo) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        jRequest.languageCode,
        constants.resourceType.message,
      )} [commentInfo]`;

      return jResponse;
    }

    var sql = null;
    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "update_TB_COR_POST_COMMENT_INFO",
      2,
    );
    var update_TB_COR_POST_COMMENT_INFO_02 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.commentInfo.postId,
      jRequest.commentInfo.commentId,
      jRequest.commentInfo.content,
      jRequest.commentInfo.userId,
    ]);

    if (update_TB_COR_POST_COMMENT_INFO_02.rowCount === 1) {
      jResponse.error_code = constants.errorCode.Success;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `EMPTY_STRING`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
    } else {
      jResponse.error_code = constants.errorCode.DBCUDError;
      jResponse.error_message = `Failed edit comment.`;
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException; // exception
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const deleteOne = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;

    if (!jRequest.commentInfo) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [commentInfo]`;

      return jResponse;
    }

    var sql = null;
    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "delete_TB_COR_POST_COMMENT_INFO",
      2,
    );
    var delete_TB_COR_POST_COMMENT_INFO_02 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.commentInfo.postId,
      jRequest.commentInfo.commentId,
      jRequest.commentInfo.userId,
    ]);

    if (delete_TB_COR_POST_COMMENT_INFO_02.rowCount === 1) {
      jResponse.error_code = constants.errorCode.Success;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `EMPTY_STRING`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
    } else {
      jResponse.error_code = constants.errorCode.DBCUDError;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `FAILED_TO_DELETE_DATA`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
      return jResponse;
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException; // exception
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

export { executeService };
