import { deploymentSystemCode } from "@/lib/tenantResolver";
"use strict";

import { logger } from "@/components/core/server/winston/logger";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import { runService } from "@/lib/serviceRunner";
import * as mailSender from "@/components/core/server/mailSender";
import { sendPush } from "@/lib/webPush";

/* ===============================
 * executeService
 * =============================== */
const executeService = (txnId, jRequest) =>
  runService(txnId, jRequest, async () => {
    switch (jRequest.commandName) {
      case constants.commands.COMPLAINT_REGISTER:
        return registerComplaint(txnId, jRequest);
      case constants.commands.COMPLAINT_MY_LIST:
        return getMyComplaints(txnId, jRequest);
      case constants.commands.COMPLAINT_ALL_LIST:
        return getAllComplaints(txnId, jRequest);
      case constants.commands.COMPLAINT_UPDATE_STATUS:
        return updateComplaintStatus(txnId, jRequest);
      case constants.commands.COMPLAINT_APPROVE:
        return approveComplaint(txnId, jRequest);
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

/* ===============================
 * 1. 불편신고 등록
 * =============================== */
const registerComplaint = async (txnId, jRequest) => {
  let jResponse = {};

  try {
    const { systemCode, userId, userName, content, images } = jRequest;

    if (!userId || !content?.trim()) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Required field [userId, content]";
      return jResponse;
    }

    // 이미지 첨부 검증: 최대 3장, data URL 형식, 장당 2MB(base64) 제한
    let imagesJson = null;
    if (Array.isArray(images) && images.length > 0) {
      const valid = images
        .slice(0, 3)
        .filter((img) => typeof img === "string" && img.startsWith("data:image/") && img.length <= 2 * 1024 * 1024);
      if (valid.length > 0) imagesJson = JSON.stringify(valid);
    }

    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "insert_TB_COR_COMPLAINT",
      1,
    );
    const result = await database.executeSQL(sql, [
      systemCode,
      userId,
      userName || "",
      content.trim(),
      imagesJson,
    ]);

    jResponse.complaintId = result.rows[0]?.complaint_id;
    jResponse.createTime = result.rows[0]?.created_at;

    // 관리자 메일 알림 — 메일 실패가 접수 자체를 막지 않도록 await 없이 발송
    try {
      const imageCount = imagesJson ? JSON.parse(imagesJson).length : 0;
      const createTime = jResponse.createTime
        ? new Date(jResponse.createTime).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
        : new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
      const adminMailText = `
[brunner-next] 문의사항 접수 알림

■ 문의번호: ${jResponse.complaintId}
■ 접수시간: ${createTime}
■ 문의자: ${userName || ""} (${userId})
■ 첨부 이미지: ${imageCount}장

■ 문의 내용:
${content.trim()}

메뉴 → 문의사항 화면의 "전체 문의 관리"에서 조치할 수 있습니다.
https://www.brunner.co.kr/mainPages/complaint
`;
      mailSender.sendMail({
        to: process.env.MAIL_USER,
        subject: `[brunner-next] 문의사항 접수 #${jResponse.complaintId}`,
        text: adminMailText,
      });
    } catch (mailErr) {
      logger.warn(`[complaint mail] failed: ${mailErr.message}`);
    }

    // 관리자에게 즉시 푸시 알림
    try {
      const adminSubSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_ADMIN_PUSH_SUBSCRIPTION", 1);
      const adminSubResult = await database.executeSQL(adminSubSql, [systemCode]);
      const preview = (content.trim().slice(0, 50) + (content.length > 50 ? "…" : ""));
      await Promise.allSettled(
        adminSubResult.rows.map((sub) =>
          sendPush(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            { title: "📩 새 문의사항 접수", body: `${userName || userId}: ${preview}`, url: `/mainPages/complaint?id=${jResponse.complaintId}`, badge: 0, complaintId: jResponse.complaintId },
          )
        )
      );
    } catch (e) {
      logger.warn(`[complaint] admin push 전송 실패: ${e.message}`);
    }

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

/* ===============================
 * 2. 내 신고 목록 조회
 * =============================== */
const getMyComplaints = async (txnId, jRequest) => {
  let jResponse = {};

  try {
    const { systemCode, userId } = jRequest;

    if (!userId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Required field [userId]";
      return jResponse;
    }

    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_COMPLAINT",
      1,
    );
    const result = await database.executeSQL(sql, [systemCode, userId]);

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

/* ===============================
 * 3. 전체 신고 목록 조회 (관리자)
 * =============================== */
const getAllComplaints = async (txnId, jRequest) => {
  let jResponse = {};

  try {
    const { systemCode } = jRequest;

    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_COMPLAINT",
      2,
    );
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

/* ===============================
 * 4. 신고 상태/조치내용 변경 (관리자: 조치중/조치완료)
 * =============================== */
const updateComplaintStatus = async (txnId, jRequest) => {
  let jResponse = {};

  try {
    const { systemCode, complaintId, status, resolution, resolvedBy } = jRequest;

    if (!complaintId || !["IN_PROGRESS", "RESOLVED"].includes(status)) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Required field [complaintId, status(IN_PROGRESS|RESOLVED)]";
      return jResponse;
    }

    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "update_TB_COR_COMPLAINT",
      1,
    );
    const result = await database.executeSQL(sql, [
      status,
      resolution || null,
      resolvedBy || "",
      systemCode,
      complaintId,
    ]);

    if (result.rowCount === 0) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = "신고를 찾을 수 없거나 이미 승인 완료된 신고입니다.";
      return jResponse;
    }

    // RESOLVED 시 의뢰자에게 즉시 푸시 알림
    if (status === "RESOLVED") {
      const userId = result.rows[0]?.user_id;
      if (userId) {
        try {
          const subSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_PUSH_SUBSCRIPTION", 1);
          const subResult = await database.executeSQL(subSql, [deploymentSystemCode(), [userId]]);
          await Promise.allSettled(
            subResult.rows.map((sub) =>
              sendPush(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                { title: "✅ 문의사항 조치 완료", body: "접수하신 문의사항이 처리되었습니다. 확인 후 승인해 주세요.", url: `/mainPages/complaint?id=${complaintId}`, badge: 0, complaintId },
              )
            )
          );
        } catch (e) {
          logger.warn(`[complaint] push 전송 실패: ${e.message}`);
        }
      }
    }

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

/* ===============================
 * 5. 조치 결과 승인 (신고자 본인, 조치완료 상태만)
 * =============================== */
const approveComplaint = async (txnId, jRequest) => {
  let jResponse = {};

  try {
    const { systemCode, complaintId, userId } = jRequest;

    if (!complaintId || !userId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Required field [complaintId, userId]";
      return jResponse;
    }

    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "update_TB_COR_COMPLAINT",
      2,
    );
    const result = await database.executeSQL(sql, [systemCode, complaintId, userId]);

    if (result.rowCount === 0) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = "조치완료 상태의 본인 신고만 승인할 수 있습니다.";
      return jResponse;
    }

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

export { executeService };
