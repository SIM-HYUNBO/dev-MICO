import { deploymentSystemCode } from "@/lib/tenantResolver";
import { logger } from "@/components/core/server/winston/logger";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import bcrypt from "bcryptjs";

const getResetLookupSQL = async (systemCode) => {
  return await dynamicSql.getSQL(systemCode, "select_TB_COR_USER_MST", 3);
};

const getResetUpdateSQL = async (systemCode) => {
  return await dynamicSql.getSQL(systemCode, "update_TB_COR_USER_MST", 1);
};

export const changePassword = async (txnId, jRequest) => {
  var jResponse = {};
  try {
    jResponse.commandName = jRequest.commandName;
    jResponse.userId = jRequest.userId;

    if (!jRequest.currentPassword) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage("REQUIRED_FIELD", constants.resourceType.message, jRequest.languageCode)} [currentPassword]`;
      return jResponse;
    }
    if (!jRequest.newPassword) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage("REQUIRED_FIELD", constants.resourceType.message, jRequest.languageCode)} [newPassword]`;
      return jResponse;
    }
    if (!jRequest.confirmPassword) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage("REQUIRED_FIELD", constants.resourceType.message, jRequest.languageCode)} [confirmPassword]`;
      return jResponse;
    }
    if (jRequest.newPassword !== jRequest.confirmPassword) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = commonFunctions.getResourceByLanguage("PASSWORD_MISMATCH", constants.resourceType.message, jRequest.languageCode);
      return jResponse;
    }

    if (jRequest.currentPassword === jRequest.newPassword) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = commonFunctions.getResourceByLanguage("PASSWORD_SAME_AS_CURRENT", constants.resourceType.message, jRequest.languageCode);
      return jResponse;
    }

    const selectSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_USER_MST", 2);
    const userResult = await database.executeSQL(selectSql, [deploymentSystemCode(), jRequest.userId]);

    if (userResult.rowCount === 0) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = commonFunctions.getResourceByLanguage("USER_ID_NOT_EXIST", constants.resourceType.message, jRequest.languageCode);
      return jResponse;
    }

    const hashedCurrentPassword = userResult.rows[0].password;
    const isCurrentMatch = await bcrypt.compare(jRequest.currentPassword, hashedCurrentPassword);
    if (!isCurrentMatch) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = commonFunctions.getResourceByLanguage("INCORRECT_PASSWORD", constants.resourceType.message, jRequest.languageCode);
      return jResponse;
    }

    const hashedNewPassword = await bcrypt.hash(jRequest.newPassword, 10);
    const updateSql = await dynamicSql.getSQL(deploymentSystemCode(), "update_TB_COR_USER_MST", 5);
    const updateResult = await database.executeSQL(updateSql, [deploymentSystemCode(), jRequest.userId, hashedNewPassword]);

    if (updateResult.rowCount === 1) {
      jResponse.error_code = constants.errorCode.Success;
      jResponse.error_message = commonFunctions.getResourceByLanguage("SUCCESS_CHANGED", constants.resourceType.message, jRequest.languageCode);
    } else {
      jResponse.error_code = constants.errorCode.DBCUDError;
      jResponse.error_message = `Failed to change password.`;
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

export const resetPassword = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;
    jResponse.userId = jRequest.userId;

    if (jRequest.userId === constants.emptyString) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [userId]`;
      return jResponse;
    }
    if (jRequest.phoneNumber === constants.emptyString) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [phoneNumber]`;
      return jResponse;
    }

    if (jRequest.authCode === constants.emptyString) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [authCode]`;
      return jResponse;
    }

    if (jRequest.newPassword === constants.emptyString) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [newPassword]`;
      return jResponse;
    }
    if (jRequest.confirmPassword === constants.emptyString) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [confirmPassword]`;
      return jResponse;
    }
    if (jRequest.newPassword !== jRequest.confirmPassword) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `The [newPassword] and [confirmPassword] field values are not same.`;
      return jResponse;
    }

    var sql = await getResetLookupSQL(deploymentSystemCode());

    var select_TB_COR_USER_MST_02 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.userId,
    ]);

    if (select_TB_COR_USER_MST_02.rowCount === 1) {
      logger.info(
        `RESULT:\n${JSON.stringify(
          select_TB_COR_USER_MST_02.rows[0],
        )}\n`,
      );
    } else if (select_TB_COR_USER_MST_02.rowCount <= 0) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `USER_ID_NOT_EXIST`,
        constants.resourceType.message,
        jRequest.languageCode,
      )}`;
      return jResponse;
    }

    if (
      jRequest.authCode !== select_TB_COR_USER_MST_02.rows[0].auth_code
    ) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = `The invalid user authorization code. please check email again.`;
      return jResponse;
    }

    const hashedCurrentPassword =
      select_TB_COR_USER_MST_02.rows[0].password;
    const isMatch = await bcrypt.compare(
      jRequest.newPassword,
      hashedCurrentPassword,
    );
    if (isMatch) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `The new password is same with current password.`;
      jResponse.rowCount = 0;
      return jResponse;
    } else {
      const hashedNewPassword = await bcrypt.hash(jRequest.newPassword, 10);
      var sql = await getResetUpdateSQL(deploymentSystemCode());

      var update_TB_COR_USER_MST_01 = await database.executeSQL(sql, [
        hashedNewPassword,
        deploymentSystemCode(),
        jRequest.userId,
        jRequest.phoneNumber,
        jRequest.authCode,
      ]);

      logger.info(
        `RESULT: rowCount=${update_TB_COR_USER_MST_01.rowCount}\n`,
      );
      if (update_TB_COR_USER_MST_01.rowCount == 1) {
        jResponse.error_code = constants.errorCode.Success;
        jResponse.error_message = `${commonFunctions.getResourceByLanguage(
          `SUCCESS_CHANGED`,
          constants.resourceType.message,
          jRequest.languageCode,
        )}`;
        logger.info(`RESULT:\n${JSON.stringify(jResponse)}\n`);
      } else {
        jResponse.error_code = constants.errorCode.DBCUDError;
        jResponse.error_message = `Failed to reset password.
                Please check the phone number and authoriztion code.`;
      }
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};
