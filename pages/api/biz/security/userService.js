import { deploymentSystemCode } from "@/lib/tenantResolver";
import { logger } from "@/components/core/server/winston/logger";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import * as mailSender from "@/components/core/server/mailSender";
import * as profileImageStorage from "@/lib/profileImageStorage";
import bcrypt from "bcryptjs";

const verifyTelNo = (args) => {
  if (/^[0-9]{2,3}-[0-9]{3,4}-[0-9]{4}/.test(args)) {
    return true;
  }
  return false;
};

const verifyEMail = (email) => {
  const re =
    /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(String(email).toLowerCase());
};

const getResetLookupSQL = async (systemCode) => {
  return await dynamicSql.getSQL(systemCode, "select_TB_COR_USER_MST", 3);
};

const getDeleteAccountSQL = async (systemCode) => {
  return await dynamicSql.getSQL(systemCode, "update_TB_COR_USER_MST", 3);
};

export const signup = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;
    jResponse.userId = jRequest.userId;

    if (!jRequest.userId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [userId]`;
      return jResponse;
    }
    if (jRequest.userId.length < 5 || jRequest.userId.length > 10) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `USER_ID_LENGTH_CHECK`,
        constants.resourceType.message,
        jRequest.languageCode,
      )}`;
      return jResponse;
    }
    if (!jRequest.password) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [password]`;
      return jResponse;
    }

    // 가입 폼 간소화 — userType 미지정 시 개인으로 기본 처리
    if (!jRequest.userType) jRequest.userType = constants.userType.Personal;

    if (jRequest.password.length < 5) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `USER_PASSWORD_LENGTH_CHECK`,
        constants.resourceType.message,
        jRequest.languageCode,
      )}`;
      return jResponse;
    }

    const hashedPassword = await bcrypt.hash(jRequest.password, 10);

    if (!jRequest.userName) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [userName]`;
      return jResponse;
    }
    if (jRequest.userName.length < 2 || jRequest.userName.length > 10) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `USER_NAME_LENGTH_CHECK`,
        constants.resourceType.message,
        jRequest.languageCode,
      )}`;
      return jResponse;
    }
    // 전화번호 선택 — 입력된 경우에만 형식 검증
    if (jRequest.phoneNumber && verifyTelNo(jRequest.phoneNumber) == false) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `The [phoneNumber] is not valid.`;
      return jResponse;
    }
    if (!jRequest.email) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [email]`;
      return jResponse;
    }
    if (verifyEMail(jRequest.email) == false) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `EMAIL_NOT_VALID`,
        constants.resourceType.message,
        jRequest.languageCode,
      )}`;
      return jResponse;
    }
    // 생년월일(registerNo)은 연령 확인(만 14세 미만 처리)용 필수 — 주소·전화는 선택
    if (!jRequest.registerNo) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [registerNo]`;
      return jResponse;
    }

    var sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      `select_TB_COR_USER_MST`,
      1,
    );

    var select_TB_COR_USER_MST_01 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.userId,
    ]);

    if (select_TB_COR_USER_MST_01.rowCount > 0) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `USER_ID_ALREADY_EXIST`,
        constants.resourceType.message,
        jRequest.languageCode,
      )}`;
      return jResponse;
    }

    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      `insert_TB_COR_USER_MST`,
      1,
    );

    var insert_TB_COR_USER_MST_01 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.userId,
      hashedPassword,
      jRequest.userName,
      jRequest.address || "",
      jRequest.phoneNumber || "",
      jRequest.email,
      `Y`,
      jRequest.registerNo,
      jRequest.userType,
      jRequest.registerName || "",
      // 계정 결제/연장 폐지 — 크레딧 기반 운영. 가입 시 사실상 무제한(9999) 유효기간 부여.
      new Date("9999-12-31T23:59:59.000Z"),
    ]);

    logger.info(
      `\nRESULT:rowCount=\n${insert_TB_COR_USER_MST_01.rowCount}\n`,
    );

    if (insert_TB_COR_USER_MST_01.rowCount == 1) {
      mailSender.sendMail({
        to: process.env.MAIL_USER,
        subject: "[brunner-next] New user signed up",
        text: `New user signed up. ID: ${jRequest.userId}, Name:${jRequest.userName}`,
      });

      jResponse.error_code = constants.errorCode.Success;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `EMPTY_STRING`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
    } else {
      jResponse.error_code = constants.errorCode.DBCUDError;
      jResponse.error_message = `Failed to create new user.\n`;
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

export const deleteAccount = async (txnId, jRequest) => {
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

    var sql = await getDeleteAccountSQL(deploymentSystemCode());

    var update_TB_COR_USER_MST_03 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.userId,
      jRequest.phoneNumber,
      jRequest.authCode,
    ]);

    logger.info(
      `RESULT: rowCount=${update_TB_COR_USER_MST_03.rowCount}\n`,
    );
    if (update_TB_COR_USER_MST_03.rowCount == 1) {
      jResponse.error_code = constants.errorCode.Success;
      jResponse.error_message = `The user account successfully deleted.`;
      logger.info(`RESULT:\n${JSON.stringify(jResponse)}\n`);
    } else {
      jResponse.error_code = constants.errorCode.DBCUDError;
      jResponse.error_message = `Failed to delete account.
            Please check the phone number and authoriztion code.`;
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

export const selectAccount = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;

    var sql = null;
    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      `select_TB_COR_USER_MST`,
      4,
    );

    var select_TB_COR_USER_MST_04 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.userId,
    ]);

    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = commonFunctions.getResourceByLanguage(
      `SUCCESS_FINISHED`,
      constants.resourceType.message,
      jRequest.languageCode,
    );

    if (select_TB_COR_USER_MST_04.rows.length == 1) {
      logger.info(
        `RESULT:\n${JSON.stringify(
          select_TB_COR_USER_MST_04.rows[0],
        )}\n`,
      );
      jResponse.data = select_TB_COR_USER_MST_04.rows;
    } else {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `INCORRECT_USER_INFO`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    logger.warn(`return ${JSON.stringify(jResponse)}\n`);
    return jResponse;
  }
};

export const updateAccount = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;

    const loginUserId = jRequest.loginUserId;
    const userId = jRequest.userId;

    var sql = null;
    var isAdminUpdate = false;

    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      `select_TB_COR_USER_MST`,
      2,
    );

    var select_TB_COR_USER_MST_02 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.loginUserId,
    ]);

    if (
      select_TB_COR_USER_MST_02.rows.length !== 1 ||
      select_TB_COR_USER_MST_02.rows[0].admin_flag == false
    ) {
      if (loginUserId !== userId) {
        throw new Error(
          commonFunctions.getResourceByLanguage(
            `NO_PERMISSION`,
            constants.resourceType.message,
            jRequest.languageCode,
          ),
        );
      }
    }

    isAdminUpdate = select_TB_COR_USER_MST_02.rows[0].admin_flag;

    var nEffected = 0;
    if (!isAdminUpdate) {
      // 사진이 data URL 로 오면 바이트는 R2 로 보내고 DB 에는 서빙 경로만 남긴다.
      // 실패해도 저장 자체를 막지는 않고 예전처럼 data URL 을 그대로 넣는다.
      let profileSrc = jRequest.profileImageBase64;
      let storedProfile = null;
      try {
        storedProfile = await profileImageStorage.storeProfileImage(
          deploymentSystemCode(),
          jRequest.userId,
          profileSrc,
        );
        if (storedProfile) profileSrc = storedProfile.src;
      } catch (e) {
        logger.error(`프로필 사진 R2 저장 실패 — DB 저장으로 대체: ${e?.message || e}`);
        storedProfile = null;
      }

      sql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        `update_TB_COR_USER_MST`,
        4,
      );

      var update_TB_COR_USER_MST_04 = await database.executeSQL(sql, [
        deploymentSystemCode(),
        jRequest.userId,
        jRequest.userName,
        jRequest.address,
        jRequest.phoneNumber,
        jRequest.emailId,
        profileSrc,
        jRequest.registerNo || null,
      ]);
      nEffected = update_TB_COR_USER_MST_04.rowCount;

      if (storedProfile && nEffected === 1) {
        await profileImageStorage.saveProfileImageRef(
          deploymentSystemCode(),
          jRequest.userId,
          storedProfile.key,
          storedProfile.src,
        );
      }
    } else {
      sql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        `update_TB_COR_USER_MST`,
        6,
      );

      var update_TB_COR_USER_MST_05 = await database.executeSQL(sql, [
        deploymentSystemCode(),
        jRequest.userId,
        jRequest.expireTime,
      ]);
      nEffected = update_TB_COR_USER_MST_05.rowCount;
    }
    if (nEffected == 1) {
      jResponse.error_code = constants.errorCode.Success;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `SUCCESS_FINISHED`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
    } else {
      jResponse.error_code = constants.errorCode.DBCUDError;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `DATABASE_FAILED`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    logger.warn(`return ${JSON.stringify(jResponse)}\n`);
    return jResponse;
  }
};

export const selectUserParamInfo = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;

    var sql = null;
    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      `select_TB_COR_USER_PARAM_INFO`,
      1,
    );

    var select_TB_COR_USER_PARAM_INFO_01 = await database.executeSQL(
      sql,
      [deploymentSystemCode(), jRequest.userId],
    );

    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = commonFunctions.getResourceByLanguage(
      `SUCCESS_FINISHED`,
      constants.resourceType.message,
      jRequest.languageCode,
    );

    if (select_TB_COR_USER_PARAM_INFO_01.rows.length == 1) {
      jResponse.data = select_TB_COR_USER_PARAM_INFO_01.rows[0];
    } else {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `NO_DATA_FOUND`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    logger.warn(`return ${JSON.stringify(jResponse)}\n`);
    return jResponse;
  }
};

export const upsertUserParamInfo = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;

    var sql = null;
    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      `select_TB_COR_USER_PARAM_INFO`,
      1,
    );

    var select_TB_COR_USER_PARAM_INFO_01 = await database.executeSQL(
      sql,
      [deploymentSystemCode(), jRequest.userId],
    );

    let nEffected = 0;
    if (select_TB_COR_USER_PARAM_INFO_01.rowCount === 1) {
      sql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        `update_TB_COR_USER_PARAM_INFO`,
        1,
      );

      var update_TB_COR_USER_PARAM_INFO_01 = await database.executeSQL(
        sql,
        [deploymentSystemCode(), jRequest.userId, jRequest.jUserParams],
      );
      nEffected = update_TB_COR_USER_PARAM_INFO_01.rowCount;
    } else if (select_TB_COR_USER_PARAM_INFO_01.rowCount === 0) {
      sql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        `insert_TB_COR_USER_PARAM_INFO`,
        1,
      );

      var insert_TB_COR_USER_PARAM_INFO_01 = await database.executeSQL(
        sql,
        [deploymentSystemCode(), jRequest.userId, jRequest.jUserParams ?? jRequest.userParams ?? {}],
      );
      nEffected = insert_TB_COR_USER_PARAM_INFO_01.rowCount;
    }

    if (nEffected == 1) {
      jResponse.error_code = constants.errorCode.Success;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `SUCCESS_FINISHED`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
    } else {
      jResponse.error_code = constants.errorCode.DBCUDError;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `DATABASE_FAILED`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    logger.warn(`return ${JSON.stringify(jResponse)}\n`);
    return jResponse;
  }
};
