import { deploymentSystemCode } from "@/lib/tenantResolver";
import { logger } from "@/components/core/server/winston/logger";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import { runService } from "@/lib/serviceRunner";

const executeService = (txnId, jRequest) =>
  runService(txnId, jRequest, async () => {
    switch (jRequest.commandName) {
      case constants.commands.POST_INFO_SELECT_ALL:
        return selectAll(txnId, jRequest);
      case constants.commands.POST_INFO_INSERT_ONE:
        return insertOne(txnId, jRequest);
      case constants.commands.POST_INFO_UPDATE_ONE:
        return updateOne(txnId, jRequest);
      case constants.commands.POST_INFO_DELETE_ONE:
        return deleteOne(txnId, jRequest);
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

const selectAll = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;
    jResponse.userId = jRequest.userId;

    if (!jRequest.postInfo) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [postInfo].`;
      return jResponse;
    }

    if (!jRequest.postInfo.postType) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [postType]`;
      return jResponse;
    }

    var sql = null;
    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_POST_INFO",
      1,
    );

    var select_TB_COR_POST_INFO_01 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.postInfo.postType,
    ]);

    const commentSql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_POST_COMMENT_INFO",
      1,
    );

    await Promise.all(
      select_TB_COR_POST_INFO_01.rows.map(async (row) => {
        const result = await database.executeSQL(commentSql, [
          deploymentSystemCode(),
          row.post_id,
        ]);
        row.comments = result.rows;
      }),
    );

    jResponse.data = select_TB_COR_POST_INFO_01.rows;

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

const insertOne = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    var postId = commonFunctions.generateUUID();
    jResponse.commandName = jRequest.commandName;

    if (!jRequest.postInfo.userId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [userId].`;
      return jResponse;
    }

    var sql = null;
    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "insert_TB_COR_POST_INFO",
      1,
    );

    var insert_TB_COR_POST_INFO_01 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      postId,
      jRequest.postInfo.postType,
      jRequest.postInfo.content,
      jRequest.postInfo.userId,
    ]);

    if (insert_TB_COR_POST_INFO_01.rowCount === 1) {
      sql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "select_TB_COR_POST_INFO",
        2,
      );

      var select_TB_COR_POST_INFO_02 = await database.executeSQL(sql, [
        deploymentSystemCode(),
        postId,
      ]);

      jResponse.data = select_TB_COR_POST_INFO_02.rows[0];
      jResponse.data.comments = [];
      jResponse.error_code = constants.errorCode.Success;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `EMPTY_STRING`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
    } else {
      jResponse.error_code = constants.errorCode.DBCUDError; // exception
      jResponse.error_message = "fail to create new post";
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

    var sql = null;
    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "update_TB_COR_POST_INFO",
      1,
    );

    var update_TB_COR_POST_INFO_01 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.postInfo.postId,
      jRequest.postInfo.content,
      jRequest.postInfo.userId,
    ]);

    if (update_TB_COR_POST_INFO_01.rowCount === 1) {
      jResponse.error_code = constants.errorCode.Success;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `EMPTY_STRING`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
    } else {
      jResponse.error_code = constants.errorCode.DBCUDError;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `FAILED_TO_UPDATE_DATA`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
      return jResponse;
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const deleteOne = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;

    if (!jRequest.postInfo) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [postInfo]`;

      return jResponse;
    }

    var sql = null;
    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "delete_TB_COR_POST_INFO",
      1,
    );

    var delete_TB_COR_POST_COMMENT_INFO_01 = await database.executeSQL(
      sql,
      [deploymentSystemCode(), jRequest.postInfo.postId, jRequest.postInfo.userId],
    );

    if (delete_TB_COR_POST_COMMENT_INFO_01.rowCount === 1) {
      sql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "delete_TB_COR_POST_COMMENT_INFO",
        1,
      );

      var delete_TB_COR_POST_COMMENT_INFO_01 =
        await database.executeSQL(sql, [
          deploymentSystemCode(),
          jRequest.postInfo.postId,
          jRequest.postInfo.userId,
        ]);

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
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

export { executeService };
