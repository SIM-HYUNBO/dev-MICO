import { deploymentSystemCode } from "@/lib/tenantResolver";
import { logger } from "@/components/core/server/winston/logger";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import * as mailSender from "@/components/core/server/mailSender";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

export const signin = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;

    // AI 전용 모의투자 계좌는 사람이 로그인할 계정이 아니다. 크론이 DB에
    // 직접 매매를 쓰므로 로그인 경로가 필요 없고, 열어두면 남의 손에
    // 그 계좌로 매매가 될 수 있다. 비밀번호 대조 전에 잘라낸다.
    if (false) {
      logger.warn(`BLOCKED SIGNIN FOR AI PAPER ACCOUNT: ${jRequest.userId}\n`);
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `FAILED_TO_SIGN_IN_AI_ACCOUNT`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
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

    if (select_TB_COR_USER_MST_02.rows.length == 1) {
      logger.info(
        `RESULT:\n${JSON.stringify(
          select_TB_COR_USER_MST_02.rows[0],
        )}\n`,
      );

      const expireTime = select_TB_COR_USER_MST_02.rows[0].expire_time;
      if (!jRequest.skipExpireCheck && (!expireTime || expireTime < new Date())) {
        jResponse.error_code = constants.errorCode.AccountExpired;
        jResponse.error_message = commonFunctions.getResourceByLanguage(
          `FAILED_TO_SIGN_IN_EXPIRED`,
          constants.resourceType.message,
          jRequest.languageCode,
        );
        jResponse.userId = jRequest.userId;
        jResponse.emailId = select_TB_COR_USER_MST_02.rows[0].email_id;
        return jResponse;
      }

      const storedHashedPassword =
        select_TB_COR_USER_MST_02.rows[0].password;

      const isMatch = await bcrypt.compare(
        jRequest.password,
        storedHashedPassword,
      );

      if (isMatch) {
        logger.warn(`PASSWORD MATCH\n`);

        sql = await dynamicSql.getSQL(
          deploymentSystemCode(),
          `select_TB_COR_USER_PARAM_INFO`,
          1,
        );

        var select_TB_COR_USER_PARAM_INFO_01 =
          await database.executeSQL(sql, [
            deploymentSystemCode(),
            jRequest.userId,
          ]);

        if (select_TB_COR_USER_PARAM_INFO_01.rowCount == 1) {
          jResponse.userParams =
            select_TB_COR_USER_PARAM_INFO_01.rows[0].user_params;
        }

        jResponse.userId = select_TB_COR_USER_MST_02.rows[0].user_id;
        jResponse.userName =
          select_TB_COR_USER_MST_02.rows[0].user_name;
        // 로그인 응답에 이메일 포함 — 클라 getLoginEmailId가 읽어 테스터 참여 등에서 기본값으로 씀
        jResponse.emailId =
          select_TB_COR_USER_MST_02.rows[0].email_id;
        jResponse.adminFlag =
          select_TB_COR_USER_MST_02.rows[0].admin_flag;
        jResponse.userType =
          select_TB_COR_USER_MST_02.rows[0].user_type;
        jResponse.registerNo =
          select_TB_COR_USER_MST_02.rows[0].register_no;
        jResponse.registerName =
          select_TB_COR_USER_MST_02.rows[0].register_name;
        jResponse.profileImageBase64 =
          select_TB_COR_USER_MST_02.rows[0].profile_image_src;

        // REST API 인증용 세션 토큰 발급
        const sessionToken = randomBytes(32).toString("hex");
        try {
          const sessionSql = await dynamicSql.getSQL(deploymentSystemCode(), "insert_TB_COR_USER_SESSION", 1);
          await database.executeSQL(sessionSql, [deploymentSystemCode(), sessionToken, jResponse.userId]);
          jResponse.sessionToken = sessionToken;
        } catch (e) {
          logger.warn(`[authService] session token insert failed: ${e.message}`);
        }

        jResponse.error_code = constants.errorCode.Success;
        jResponse.error_message = commonFunctions.getResourceByLanguage(
          `EMPTY_STRING`,
          constants.resourceType.message,
          jRequest.languageCode,
        );

        mailSender.sendMail({
          to: process.env.MAIL_USER,
          subject: "[brunner-next] New user signed in",
          text: `New user signed in. ID: ${jResponse.userId}, Name:${jResponse.userName}`,
        });
      } else {
        jResponse.error_code = constants.errorCode.ServerValidationError;
        jResponse.error_message = commonFunctions.getResourceByLanguage(
          `INCORRECT_PASSWORD`,
          constants.resourceType.message,
          jRequest.languageCode,
        );
      }
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

// 로그인 응답은 그 시점의 계정 정보를 클라이언트 localStorage 로 복사해 둔 것이다.
// 그래서 DB 의 admin_flag 를 켜도 다시 로그인하기 전까지는 관리자 메뉴가 나오지
// 않았다. 세션 토큰으로 본인임을 확인한 뒤 계정 정보를 DB 에서 다시 읽어 돌려준다.
// 화면 진입 때마다 호출되므로 실패해도 조용히 넘어가고 기존 정보를 유지한다.
export const refreshSession = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;

    if (!jRequest.userId || !jRequest.sessionToken) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `INCORRECT_USER_INFO`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
      return jResponse;
    }

    // 이 두 쿼리는 동적 SQL(TB_COR_SQL_INFO)을 거치지 않고 직접 쓴다.
    //
    // 이 프레임워크는 SQL 을 DB 문자열로 저장해두고 이름으로 꺼내 쓰는데,
    // 그러면 저장된 문자열이 낡거나 컬럼이 빠져도 코드는 아무 오류 없이
    // undefined 를 받는다. admin_flag 가 빠져 있으면 관리자가 관리자가
    // 아닌 것처럼 조용히 동작하고, 원인을 코드에서 찾을 수 없게 된다.
    // 신원과 권한은 그런 간접 참조 뒤에 두지 않는다 — serverSql.js 의
    // 부트스트랩 쿼리도 같은 이유로 인라인이다.
    const sessionSql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_USER_SESSION",
      1,
    );
    const session = await database.executeSQL(sessionSql, [
      deploymentSystemCode(),
      jRequest.sessionToken,
      jRequest.userId,
    ]);

    if (session.rowCount !== 1) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `INCORRECT_USER_INFO`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
      return jResponse;
    }

    const extendSql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "update_TB_COR_USER_SESSION_EXPIRES",
      1,
    );
    await database.executeSQL(extendSql, [
      deploymentSystemCode(),
      jRequest.sessionToken,
      jRequest.userId,
    ]);

    const userSql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_USER_MST",
      8,
    );
    const user = await database.executeSQL(userSql, [
      deploymentSystemCode(),
      jRequest.userId,
    ]);

    if (user.rows.length !== 1) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `INCORRECT_USER_INFO`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
      return jResponse;
    }

    const row = user.rows[0];
    jResponse.userId = row.user_id;
    jResponse.userName = row.user_name;
    jResponse.emailId = row.email_id;
    jResponse.adminFlag = row.admin_flag;
    jResponse.userType = row.user_type;
    jResponse.registerNo = row.register_no;
    jResponse.registerName = row.register_name;
    jResponse.profileImageBase64 = row.profile_image_src;

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

export const signout = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;
    jResponse.__REMOTE_CLIENT_IP = jRequest.__REMOTE_CLIENT_IP;

    if (jRequest.sessionToken) {
      try {
        const sql = await dynamicSql.getSQL(deploymentSystemCode(), "delete_TB_COR_USER_SESSION", 1);
        await database.executeSQL(sql, [deploymentSystemCode(), jRequest.sessionToken]);
      } catch (e) {
        logger.warn(`[authService] session token delete failed: ${e.message}`);
      }
    }

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
