import { deploymentSystemCode } from "@/lib/tenantResolver";
import { logger } from "@/components/core/server/winston/logger";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import * as mailSender from "@/components/core/server/mailSender";

const generateRandomString = (length) => {
  const characters =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = constants.emptyString;
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charactersLength);
    result += characters[randomIndex];
  }
  return result;
};

const getPasswordResetSQL = async (systemCode, sqlSeq) => {
  return await dynamicSql.getSQL(systemCode, "select_TB_COR_USER_MST", sqlSeq);
};

const getPasswordResetUpdateSQL = async (systemCode, sqlSeq) => {
  return await dynamicSql.getSQL(systemCode, "update_TB_COR_USER_MST", sqlSeq);
};

export const sendEMailAuthCode = async (txnId, jRequest) => {
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
    if (jRequest.email === constants.emptyString) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [email]`;
      return jResponse;
    }

    var sql = await getPasswordResetSQL(deploymentSystemCode(), 3);

    var select_TB_COR_USER_MST_03 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.userId,
    ]);

    if (select_TB_COR_USER_MST_03.rowCount === 1) {
      if (
        select_TB_COR_USER_MST_03.rows[0].phone_number !==
          jRequest.phoneNumber ||
        select_TB_COR_USER_MST_03.rows[0].email_id !== jRequest.email
      ) {
        jResponse.error_code = constants.errorCode.DBValidationError;
        jResponse.error_message = `${commonFunctions.getResourceByLanguage(
          `PHONE_NUMBER_OR_EMAIL_NOT_VALID`,
          constants.resourceType.message,
          jRequest.languageCode,
        )}`;
        return jResponse;
      } else {
        var authCode = generateRandomString(6);

        mailSender.sendMail({
          to: select_TB_COR_USER_MST_03.rows[0].email_id,
          subject: "[brunner-next]Your Authentication Code",
          text: `Your user authentication code is: ${authCode}`,
        });

        var sql = await getPasswordResetUpdateSQL(deploymentSystemCode(), 2);

        var update_TB_COR_USER_MST_02 = await database.executeSQL(sql, [
          authCode,
          deploymentSystemCode(),
          jRequest.userId,
        ]);

        logger.info(
          `RESULT: rowCount=${update_TB_COR_USER_MST_02.rowCount}\n`,
        );
        if (update_TB_COR_USER_MST_02.rowCount == 1) {
          jResponse.error_code = constants.errorCode.Success;
          jResponse.error_message = `사용자 인증코드를 등록된 이메일 주소로 발송했습니다.
메일을 확인하고 인증코드를 입력하세요.`;
          logger.info(`RESULT:\n${JSON.stringify(jResponse)}\n`);
        } else {
          jResponse.error_code = constants.errorCode.DBCUDError;
          jResponse.error_message = `사용자 인증코드를 발송하지 못했습니다.
등록한 이메일 주소를 확인하고 다시 요청하세요.`;
        }
      }
    } else if (select_TB_COR_USER_MST_03.rowCount <= 0) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `NO_DATA_FOUND`,
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
