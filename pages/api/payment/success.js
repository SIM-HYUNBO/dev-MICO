"use strict";

/**
 * 결제 승인 콜백.
 *
 * 토스 결제창이 성공 시 이 경로로 리다이렉트하며 paymentKey/orderId/amount 를
 * 쿼리로 넘긴다. 여기서 승인(confirm)을 거쳐야 실제 결제가 완료된다.
 *
 * 원본(brunner-next)에서는 이 라우트가 AI 콘텐츠의 크레딧·후원 정산에 직접
 * 묶여 있었다. 템플릿에서는 승인까지만 공통으로 처리하고, 승인 후 무엇을
 * 줄지는 크레딧 지급 하나로 일반화했다. 다른 정산이 필요한 프로젝트는
 * settle() 만 갈아끼우면 된다.
 */

import { logger } from "@/components/core/server/winston/logger";
import * as tossPayment from "@/components/core/server/payment/tossPayment";
import { creditGrantOnce, wonToCredits } from "@/pages/api/biz/credit";
import { recordPayment } from "@/pages/api/biz/payment";
import { deploymentSystemCode } from "@/lib/tenantResolver";

const redirectTo = (res, path, params) =>
  res.redirect(302, `${path}?${new URLSearchParams(params).toString()}`);

export default async (req, res) => {
  const { paymentKey, orderId, amount, userId, returnTo } = req.query;

  // 충전을 시작한 화면으로 돌려보낸다. 외부 주소로 튕기지 않도록 내부 절대경로만
  // 허용한다("//host" 형태는 브라우저가 외부로 해석하므로 함께 막는다).
  const isInternalPath = (p) =>
    typeof p === "string" && p.startsWith("/") && !p.startsWith("//");
  const returnPath = isInternalPath(returnTo)
    ? returnTo
    : process.env.PAYMENT_RETURN_PATH || "/";

  if (!paymentKey || !orderId || !amount) {
    return redirectTo(res, returnPath, { pay: "invalid" });
  }

  /**
   * 승인된 금액만큼 크레딧을 지급한다.
   * orderId 를 참조로 쓰므로 재시도·새로고침에도 한 번만 지급된다.
   */
  const settle = async (wonAmount, tossData) => {
    const sc = deploymentSystemCode();
    const credits = wonToCredits(wonAmount);
    const { granted, balance } = await creditGrantOnce(
      sc,
      userId,
      credits,
      "purchase",
      String(orderId),
    );

    // 결제 이력은 크레딧 원장과 별개로 남긴다. 원장에는 크레딧 증감만 있어
    // 환불 금액·토스 취소 키·대사 근거를 되살릴 수 없기 때문이다.
    //
    // 이 시점에 결제는 이미 성사됐다. 기록 실패를 여기서 던지면 돈은 빠졌는데
    // 화면은 실패로 보이게 되므로, 로그만 남기고 사용자 흐름은 그대로 진행한다.
    try {
      await recordPayment(sc, {
        orderId,
        paymentKey,
        userId,
        amountWon: wonAmount,
        creditsGranted: credits,
        method: tossData?.method,
        approvedAt: tossData?.approvedAt,
        raw: tossData,
      });
    } catch (e) {
      logger.error(`[payment] 이력 기록 실패 order=${orderId}: ${e.message}`);
    }

    logger.info(`[payment] order=${orderId} won=${wonAmount} credits=${credits} granted=${granted}`);
    return { pay: "ok", credits: String(credits), balance: String(balance ?? "") };
  };

  try {
    const { ok, data } = await tossPayment.confirmPayment({ paymentKey, orderId, amount });

    if (ok) {
      return redirectTo(res, returnPath, await settle(data?.totalAmount ?? amount, data));
    }

    // 승인 요청은 실패했지만 이미 승인된 결제일 수 있다(중복 호출·타임아웃).
    // 결제 상태를 다시 조회해 실제로 완료됐다면 지급 누락을 복구한다.
    const pay = await tossPayment.getPayment(paymentKey);
    if (pay.ok && pay.data?.status === "DONE") {
      return redirectTo(res, returnPath, await settle(pay.data.totalAmount, pay.data));
    }

    logger.warn(`[payment] confirm failed order=${orderId}`);
    return redirectTo(res, returnPath, { pay: "fail" });
  } catch (e) {
    logger.error(`[payment] error order=${orderId}: ${e.message}`);
    return redirectTo(res, returnPath, { pay: "error" });
  }
};
