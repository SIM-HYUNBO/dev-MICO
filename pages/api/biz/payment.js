import { deploymentSystemCode } from "@/lib/tenantResolver";
import * as constants from "@/lib/constants";
import { SCHEMA } from "@/lib/dbSchema";
import * as commonFunctions from "@/lib/commonFunctions";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import { runService } from "@/lib/serviceRunner";
import { verifySession } from "@/lib/serverSession";
import { logger } from "@/components/core/server/winston/logger";
import * as tossPayment from "@/components/core/server/payment/tossPayment";
import { creditAdjust, creditSpendIfEnough } from "@/pages/api/biz/credit";

const SCHEMA_NAME = SCHEMA;

/**
 * 결제 이력 (TB_COR_PAYMENT_HIST).
 *
 * 크레딧 원장은 "크레딧이 어떻게 움직였나"를, 이 모듈은 "돈이 어떻게 움직였나"를
 * 담당한다. 둘은 ORDER_ID 로 연결된다(원장의 REF = 여기의 ORDER_ID).
 *
 * 기록은 결제 승인 콜백(pages/api/payment/success.js)에서 recordPayment() 로 남기고,
 * 조회는 사용자 본인 내역과 관리자 전체 내역 두 가지를 제공한다.
 */

const ok = (jRequest, data = {}) => ({
  commandName: jRequest.commandName,
  ...data,
  error_code: constants.errorCode.Success,
  error_message: commonFunctions.getResourceByLanguage(
    "SUCCESS_FINISHED",
    constants.resourceType.message,
    jRequest.languageCode,
  ),
});

const noPermission = (jRequest) => ({
  commandName: jRequest.commandName,
  error_code: constants.errorCode.ServerValidationError,
  error_message: commonFunctions.getResourceByLanguage(
    "NO_PERMISSION",
    constants.resourceType.message,
    jRequest.languageCode,
  ),
});

const fail = (jRequest, messageKey, detail) => ({
  commandName: jRequest.commandName,
  error_code: constants.errorCode.ServerValidationError,
  error_message: [
    commonFunctions.getResourceByLanguage(
      messageKey,
      constants.resourceType.message,
      jRequest.languageCode,
    ),
    detail || "",
  ]
    .filter(Boolean)
    .join(" "),
});

/** 관리자 여부. admin_flag 는 배포마다 boolean/'Y'/'true' 로 들어와 있어 세 가지를 모두 받는다. */
const isAdminUser = async (jRequest) => {
  const userSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_USER_MST", 1);
  const user = await database.executeSQL(userSql, [deploymentSystemCode(), jRequest.userId]);
  const flag = user.rows[0]?.admin_flag;
  return flag === true || String(flag).toUpperCase() === "Y" || String(flag) === "true";
};

// PAYMENT_KEY 는 목록에 싣지 않는다. 토스 취소·조회에 쓰는 키라 화면에 필요가
// 없고, 응답에 담기는 순간 노출면만 넓어진다. 취소 처리는 주문번호 단건
// 조회(SQL_SEQ 2)로 서버에서만 꺼내 쓴다.
const toRow = (r) => ({
  order_id: r.order_id,
  user_id: r.user_id,
  amount_won: Number(r.amount_won || 0),
  credits_granted: Number(r.credits_granted || 0),
  method: r.method || "",
  status: r.status || "APPROVED",
  canceled_amount: Number(r.canceled_amount || 0),
  approved_at: r.approved_at,
  canceled_at: r.canceled_at,
});

/**
 * 결제 승인 기록. ORDER_ID 가 멱등 키라 같은 주문이 두 번 들어와도 한 행이다.
 *
 * 결제는 이미 성사된 상태이므로 여기서 예외가 나도 사용자 흐름을 막지 않는다.
 * 기록 실패가 지급 실패로 번지면 돈은 빠졌는데 크레딧이 없는 상황이 되기 때문에,
 * 호출부에서 잡아 로그만 남기고 진행한다.
 */
export const recordPayment = async (systemCode, payment) => {
  const sql = await dynamicSql.getSQL(systemCode, "insert_TB_COR_PAYMENT_HIST", 1);
  const result = await database.executeSQL(sql, [
    systemCode,
    String(payment.orderId),
    payment.paymentKey ? String(payment.paymentKey) : null,
    String(payment.userId || ""),
    Number(payment.amountWon || 0),
    Number(payment.creditsGranted || 0),
    payment.method ? String(payment.method) : null,
    payment.approvedAt || null,
    payment.raw ? JSON.stringify(payment.raw) : null,
  ]);
  return result.rows?.[0]?.order_id || null;
};

const selectMyHistory = async (txnId, jRequest) => {
  // 결제 내역은 본인 것만 보여야 한다. 세션으로 신원을 확인하지 않으면
  // 남의 userId 를 넣어 그 사람의 결제 금액·주문번호를 그대로 받을 수 있다.
  if (!(await verifySession(SCHEMA_NAME, deploymentSystemCode(), jRequest.userId, jRequest.sessionToken)))
    return noPermission(jRequest);

  const sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_PAYMENT_HIST", 1);
  const result = await database.executeSQL(sql, [deploymentSystemCode(), jRequest.userId]);
  return ok(jRequest, { payments: result.rows.map(toRow) });
};

const selectAllHistory = async (txnId, jRequest) => {
  // 전체 결제 내역은 다른 사용자의 결제 정보라 세션 확인 + 관리자만 볼 수 있어야 한다.
  if (!(await verifySession(SCHEMA_NAME, deploymentSystemCode(), jRequest.userId, jRequest.sessionToken)))
    return noPermission(jRequest);

  if (!(await isAdminUser(jRequest))) return noPermission(jRequest);

  const sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_PAYMENT_HIST", 3);
  const result = await database.executeSQL(sql, [deploymentSystemCode()]);
  return ok(jRequest, { payments: result.rows.map(toRow) });
};

/**
 * 결제 전액 취소.
 *
 * 토스 취소와 크레딧 회수, 두 시스템을 함께 움직여야 하는데 둘을 한 트랜잭션에
 * 묶을 방법이 없다. 그래서 순서를 "우리 쪽 먼저, 토스 나중" 으로 잡는다.
 * 토스를 먼저 부르면 환불은 됐는데 크레딧 회수가 실패하는 순간 크레딧이 공짜로
 * 남고, 그 방향은 되돌릴 수단이 없다. 반대 방향(우리 쪽만 되돌리기)은 가능하다.
 *
 * 1) APPROVED 인 행만 CANCELED 로 선점 — 동시 요청이 두 번 환불하지 못하게 막는다
 * 2) 지급했던 크레딧 회수 — 이미 써서 잔액이 모자라면 취소를 거절한다
 * 3) 토스 취소 — 실패하면 1·2 를 되돌린다
 */
const cancelOne = async (txnId, jRequest) => {
  if (!(await verifySession(SCHEMA_NAME, deploymentSystemCode(), jRequest.userId, jRequest.sessionToken)))
    return noPermission(jRequest);

  const systemCode = deploymentSystemCode();
  const orderId = String(jRequest.orderId || "").trim();
  if (!orderId) return fail(jRequest, "PAYMENT_CANCEL_NOT_FOUND");

  const selectSql = await dynamicSql.getSQL(systemCode, "select_TB_COR_PAYMENT_HIST", 2);
  const found = await database.executeSQL(selectSql, [systemCode, orderId]);
  const row = found.rows?.[0];
  if (!row) return fail(jRequest, "PAYMENT_CANCEL_NOT_FOUND");

  // 본인 결제이거나 관리자여야 한다.
  if (row.user_id !== jRequest.userId && !(await isAdminUser(jRequest)))
    return noPermission(jRequest);

  if (String(row.status || "") !== "APPROVED") return fail(jRequest, "PAYMENT_ALREADY_CANCELED");
  // 승인 기록에 PAYMENT_KEY 가 없으면 토스에 취소를 요청할 방법이 없다.
  if (!row.payment_key) return fail(jRequest, "PAYMENT_CANCEL_UNAVAILABLE");

  const amountWon = Number(row.amount_won || 0);
  const credits = Number(row.credits_granted || 0);
  const ownerId = row.user_id;

  const claimSql = await dynamicSql.getSQL(systemCode, "update_TB_COR_PAYMENT_HIST", 2);
  const claimed = await database.executeSQL(claimSql, [systemCode, orderId, amountWon]);
  if (!claimed.rows?.length) return fail(jRequest, "PAYMENT_ALREADY_CANCELED");

  const restoreApproved = async () => {
    try {
      const restoreSql = await dynamicSql.getSQL(systemCode, "update_TB_COR_PAYMENT_HIST", 3);
      await database.executeSQL(restoreSql, [systemCode, orderId]);
    } catch (e) {
      logger.error(`[payment] 취소 롤백 실패 order=${orderId}: ${e.message}`);
    }
  };

  if (credits > 0) {
    const clawback = await creditSpendIfEnough(systemCode, ownerId, credits, "refund", orderId);
    if (!clawback.ok) {
      await restoreApproved();
      return fail(jRequest, "PAYMENT_CANCEL_CREDIT_SHORT");
    }
  }

  try {
    const { ok: canceled, data } = await tossPayment.cancelPayment({
      paymentKey: row.payment_key,
      cancelReason: jRequest.cancelReason || "고객 요청",
      idempotencyKey: `cancel-${orderId}`,
    });
    if (!canceled) throw new Error(data?.message || `toss cancel ${data?.code || ""}`.trim());
  } catch (e) {
    if (credits > 0) {
      try {
        await creditAdjust(systemCode, ownerId, credits, "refundRollback", orderId);
      } catch (rollbackError) {
        logger.error(`[payment] 크레딧 회수 롤백 실패 order=${orderId}: ${rollbackError.message}`);
      }
    }
    await restoreApproved();
    logger.error(`[payment] 취소 실패 order=${orderId}: ${e.message}`);
    return fail(jRequest, "PAYMENT_CANCEL_FAILED", e.message);
  }

  logger.info(`[payment] canceled order=${orderId} won=${amountWon} credits=${credits} by=${jRequest.userId}`);
  return ok(jRequest, { orderId, canceledAmount: amountWon, canceledCredits: credits });
};

const executeService = (txnId, jRequest) =>
  runService(txnId, jRequest, async () => {
    switch (jRequest.commandName) {
      case constants.commands.PAYMENT_HISTORY:
        return selectMyHistory(txnId, jRequest);
      case constants.commands.PAYMENT_HISTORY_ALL:
        return selectAllHistory(txnId, jRequest);
      case constants.commands.PAYMENT_CANCEL:
        return cancelOne(txnId, jRequest);
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

export { executeService };
