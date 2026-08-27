"use strict";

/**
 * 크레딧 원장 — 선불 잔액과 사용 내역.
 *
 * 결제(components/core/server/payment/tossPayment.js)와 짝을 이루지만
 * 결제에 의존하지 않는다. 충전은 결제로, 차감은 각 서비스가 자기 사유로
 * 호출한다. 크레딧을 무엇에 쓰는지는 이 모듈이 알지 않는다.
 *
 * 원본(brunner-next)에서는 이 로직이 AI 콘텐츠 모듈 안에 있었고 테이블도
 * TB_AIC_* 였다. 템플릿에서는 도메인 흔적을 지우고 TB_CREDIT_* 로 옮겼다.
 */

import * as database from "@/pages/api/biz/database/database";
import { SCHEMA } from "@/lib/dbSchema";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import { verifySession } from "@/lib/serverSession";
import * as commonFunctions from "@/lib/commonFunctions";
import * as constants from "@/lib/constants";

/** 신규 사용자에게 최초 1회 지급할 크레딧. 0 이면 지급하지 않는다. */
const STARTER_CREDIT = Number(process.env.CREDIT_STARTER ?? 0);

/** 결제 금액(원) → 크레딧 환산. 프로젝트에 맞게 조정한다. */
export const wonToCredits = (won) =>
  Math.floor(Number(won) / Number(process.env.CREDIT_WON_PER_CREDIT ?? 10));

/**
 * 잔액 증감 + 원장 기록.
 * delta 가 음수면 차감이다. 잔액 확인 없이 그대로 반영하므로,
 * 사용자 지출에는 creditSpendIfEnough 를 쓸 것.
 */
export const creditAdjust = async (systemCode, userId, delta, reason, ref) => {
  const upd = await dynamicSql.getSQL(systemCode, "update_TB_COR_CREDIT_MST", 1);
  const r = await database.executeSQL(upd, [systemCode, userId, delta]);
  const balance = r.rows?.[0]?.balance ?? 0;

  const led = await dynamicSql.getSQL(systemCode, "insert_TB_COR_CREDIT_LEDGER", 1);
  await database.executeSQL(led, [
    systemCode,
    commonFunctions.generateUUID(),
    userId,
    delta,
    balance,
    reason || null,
    ref || null,
  ]);
  return balance;
};

/**
 * 외부 참조(ref, 예: 결제 orderId) 기준 멱등 지급.
 *
 * 같은 ref+reason 원장이 이미 있으면 재지급하지 않는다. 결제 성공
 * 리다이렉트가 새로고침되거나 재시도되어도 중복 충전되지 않게 하고,
 * 승인은 됐는데 지급이 누락된 경우에는 한 번 복구되도록 한다.
 */
export const creditGrantOnce = async (systemCode, userId, delta, reason, ref) => {
  if (ref) {
    const sel = await dynamicSql.getSQL(systemCode, "select_TB_COR_CREDIT_LEDGER", 2);
    const ex = await database.executeSQL(sel, [systemCode, String(ref), reason]);
    if (ex.rows?.length) return { granted: false };
  }
  const balance = await creditAdjust(systemCode, userId, delta, reason, ref);
  return { granted: true, balance };
};

/**
 * 원자적 차감 — 잔액이 amount 이상일 때만 한 번의 UPDATE 로 차감한다.
 * 조회 후 차감하면 동시 요청이 잔액을 초과 지출할 수 있어 조건을 SQL 에 둔다.
 * 잔액 부족이면 { ok: false } 이고 아무것도 차감되지 않는다.
 */
export const creditSpendIfEnough = async (systemCode, userId, amount, reason, ref) => {
  const upd = await dynamicSql.getSQL(systemCode, "update_TB_COR_CREDIT_MST", 2);
  const r = await database.executeSQL(upd, [systemCode, userId, amount]);
  if (!r.rows?.length) return { ok: false };

  const balance = r.rows[0].balance;
  const led = await dynamicSql.getSQL(systemCode, "insert_TB_COR_CREDIT_LEDGER", 1);
  await database.executeSQL(led, [
    systemCode,
    commonFunctions.generateUUID(),
    userId,
    -amount,
    balance,
    reason || null,
    ref || null,
  ]);
  return { ok: true, balance };
};

/** 잔액 조회. 계정이 없으면 스타터 크레딧을 지급하며 만든다. */
export const creditBalance = async (systemCode, userId) => {
  const sel = await dynamicSql.getSQL(systemCode, "select_TB_COR_CREDIT_MST", 1);
  const r = await database.executeSQL(sel, [systemCode, userId]);
  if (r.rows?.length) return r.rows[0].balance;

  if (STARTER_CREDIT > 0) {
    return creditAdjust(systemCode, userId, STARTER_CREDIT, "starter", null);
  }
  return 0;
};

/** 사용 내역 조회. */
export const creditLedger = async (systemCode, userId) => {
  const sel = await dynamicSql.getSQL(systemCode, "select_TB_COR_CREDIT_LEDGER", 1);
  const r = await database.executeSQL(sel, [systemCode, userId]);
  return r.rows ?? [];
};

/* ------------------------------------------------------------------ *
 * backendServer 디스패치 진입점 — commandName 이 `credit.` 으로 시작할 때
 * ------------------------------------------------------------------ */

export const executeService = async (txnId, jRequest) => {
  const jResponse = {};
  const { systemCode, userId, commandName } = jRequest;

  try {
    // 잔액·원장은 본인 것만 보여야 한다. 세션을 확인하지 않으면 남의 userId 로
    // 원장(결제 orderId 포함)을 읽거나, 임의 사용자에게 가입 크레딧 행을
    // 만들게 할 수 있다. payment.js 와 같은 기준으로 막는다.
    if (!(await verifySession(SCHEMA, systemCode, userId, jRequest.sessionToken))) {
      jResponse.error_code = -1;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        "NO_PERMISSION",
        constants.resourceType.message,
        jRequest.languageCode,
      );
      return jResponse;
    }

    switch (commandName) {
      case constants.commands.CREDIT_BALANCE:
        jResponse.balance = await creditBalance(systemCode, userId);
        break;

      case constants.commands.CREDIT_LEDGER:
        jResponse.ledger = await creditLedger(systemCode, userId);
        break;

      default:
        jResponse.error_code = -1;
        jResponse.error_message = `${commandName} not supported`;
        return jResponse;
    }
    jResponse.error_code = 0;
  } catch (e) {
    jResponse.error_code = -1;
    jResponse.error_message = e.message;
  }
  return jResponse;
};
