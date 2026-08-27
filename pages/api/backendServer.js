"use strict";

import { logger } from "@/components/core/server/winston/logger";
import { deploymentSystemCode } from "@/lib/tenantResolver";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import { loadResourceTextRows } from "@/lib/resourceTextServer";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import * as edocComponentTemplate from "./biz/eDoc/eDocComponentTemplate";
import * as edocDocument from "@/pages/api/biz/eDoc/eDocDocument";
import * as edocCustom from "@/pages/api/biz/eDoc/eDocCustom";
import * as postInfo from "@/pages/api/biz/postInfo";
import * as credit from "@/pages/api/biz/credit";
import * as payment from "@/pages/api/biz/payment";
import * as dbUsage from "@/pages/api/biz/dbUsage";
import * as postCommentInfo from "@/pages/api/biz/postCommentInfo";
import * as security from "@/pages/api/biz/security";
import * as chatroom from "@/pages/api/biz/chatroom";
import * as openchat from "@/pages/api/biz/openchat";
import * as txnHistory from "@/pages/api/biz/txnHistory";
import * as userActivity from "@/pages/api/biz/userActivity";
import * as schedule from "@/pages/api/biz/schedule";
import * as friend from "@/pages/api/biz/friend";
import * as complaint from "@/pages/api/biz/complaint";
import * as androidTester from "@/pages/api/biz/androidTester";

export const config = {
  api: {
    bodyParser: false, // multipart 업로드 하려면 무조건 끄기
    responseLimit: "100mb",
  },
};

/**
 * 최종 서버 핸들러
 */
export default async (req, res) => {
  await initializeServer();
  await waitUntilReady();

  const remoteIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  // 모든 도메인 허용 (필수)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  // GET 요청 처리
  let jRequest = {};
  let jResponse = {};

  if (req.method === constants.httpMethod.GET) {
    throw new Error(
      commonFunctions.getResourceByLanguage(
        `SERVER_NOT_SUPPORTED_METHOD`,
        constants.resourceType.message,
      ),
    );
  } else {
    // POST/PUT 등은 bodyParser가 꺼졌으므로 직접 읽기
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const rawBody = Buffer.concat(buffers).toString();
    jRequest = JSON.parse(rawBody);
  }

  // 테넌트는 클라이언트가 정하지 않는다. 요청이 들어온 도메인/배포로 서버가 정한다.
  //
  // 본문의 systemCode 를 그대로 믿으면, 그 값만 바꿔 보내는 것으로 다른 테넌트의
  // 데이터를 그대로 읽고 쓸 수 있다. 스키마를 하나로 합친 지금은 같은 DB 안의
  // 다른 서비스 데이터가 통째로 열린다 — 실제로 systemCode 를 '00' 으로 넣어
  // 남의 테넌트 확장속성이 조회되는 것을 확인했다.
  let resolvedSystemCode;
  try {
    resolvedSystemCode = deploymentSystemCode();
  } catch (e) {
    // SYSTEM_CODE 가 없으면 어느 테넌트인지 알 수 없다. 추측해서 '00' 으로 돌리면
    // 남의 테넌트를 건드리므로, 열지 않고 닫는다.
    logger.error(`[tenant] ${e.message}`);
    return res.status(500).json({ error_code: -1, error_message: e.message });
  }

  if (jRequest.systemCode && jRequest.systemCode !== resolvedSystemCode) {
    logger.warn(
      `[tenant] 요청 본문의 systemCode(${jRequest.systemCode})를 무시하고 배포 기준(${resolvedSystemCode})으로 처리한다.`,
    );
  }
  jRequest.systemCode = resolvedSystemCode;

  jRequest._txnId = await commonFunctions.generateTxnId();
  const commandName = jRequest.commandName || constants.emptyString;

  let exception = null;

  logger.warn(`START TXN ${commandName} from ${remoteIp}`);
  const startTxnTime = Date.now();

  try {
    const response = await executeService(jRequest);
    jResponse = commonFunctions.isJsonObject(response)
      ? response
      : JSON.parse(response.toString());
  } catch (e) {
    exception = e.message || e;
    jResponse = { error_code: -1, error_message: exception };
    logger.error(`Error in TXN ${commandName}: ${exception}`);
  } finally {
    const durationMs = Date.now() - startTxnTime;
    jResponse._txnId = jRequest._txnId;
    jResponse._durationMs = durationMs;
    jResponse._exception = exception;

    res.json(jResponse);
    logger.warn(`END TXN ${commandName} in ${durationMs} ms`);

    if (
      process.env.NODE_ENV === "production" &&
      jRequest.commandName !== constants.commands.TXN_HISTORY_SELECT_ALL &&
      jRequest.userId &&
      jRequest.userId !== "" &&
      !process.env.TXN_HISTORY_EXCLUDED_USERS?.split(',').map(u => u.trim()).includes(jRequest.userId)
    )
      txnHistory.saveTxnHistoryAsync(remoteIp, jRequest, jResponse);

    if (process.env.NODE_ENV === "production") {
      userActivity.saveUserActivityAsync(jRequest);
    }
  }
};

let isReady = false;
let readyPromise = null;
let dynamicSqlList = null;

export async function initializeServer() {
  if (isReady) return Promise.resolve(); // 이미 초기화가 완료되었으면 그냥 통과
  if (readyPromise) return readyPromise; // 이미 초기화가 시작되었으면 실행중인 함수 promise 반환

  logger.info("Loading Dynamic SQL ...");

  // 즉시 실행 async 함수로 Promise 생성
  readyPromise = (async () => {
    try {
      const resourceRows = await loadResourceTextRows(deploymentSystemCode());
      commonFunctions.setResourceTextRows(resourceRows);
      logger.info(`Resource text loaded: ${resourceRows.length}`);
    } catch (e) {
      logger.warn(`Resource text load skipped: ${e.message}`);
    }

    if (!process.dynamicSql) {
      process.dynamicSql = await dynamicSql.loadAll();
      dynamicSqlList = process.dynamicSql;
      logger.info(`Dynamic SQL loaded: ${dynamicSqlList?.size}`);
    } else {
      dynamicSqlList = process.dynamicSql;
    }

    isReady = true; // 초기화 완료 표시
  })();

  return readyPromise;
}

export function waitUntilReady() {
  return isReady ? Promise.resolve() : readyPromise;
}

/**
 * 모듈 맵 기반 서비스 실행
 */
const moduleMap = {
  [constants.modulePrefix.security]: security.executeService,
  [constants.modulePrefix.dynamicSql]: dynamicSql.executeService,
  [constants.modulePrefix.postInfo]: postInfo.executeService,
  [constants.modulePrefix.postCommentInfo]: postCommentInfo.executeService,
  [constants.modulePrefix.edocComponentTemplate]:
    edocComponentTemplate.executeService,
  [constants.modulePrefix.edocDocument]: edocDocument.executeService,
  [constants.modulePrefix.edocCustom]: edocCustom.executeService,

  [constants.modulePrefix.chatroom]: chatroom.executeService,
  [constants.modulePrefix.friend]: friend.executeService,
  [constants.modulePrefix.txnHistory]: txnHistory.executeService,
  [constants.modulePrefix.userActivity]: userActivity.executeService,
  [constants.modulePrefix.schedule]: schedule.executeService,
  [constants.modulePrefix.complaint]: complaint.executeService,
  [constants.modulePrefix.androidTester]: androidTester.executeService,
  [constants.modulePrefix.openchat]: openchat.executeService,
  [constants.modulePrefix.credit]: credit.executeService,
  [constants.modulePrefix.payment]: payment.executeService,
  [constants.modulePrefix.dbUsage]: dbUsage.executeService,
};

const executeService = async (jRequest) => {
  const commandName = jRequest.commandName;

  if (!commandName) {
    return {
      error_code: -1,
      error_message: `${commonFunctions.getResourceByLanguage(
        `SERVER_NO_COMMAND_NAME`,
        constants.resourceType.message,
        jRequest.languageCode,
      )}\n${commonFunctions.getResourceByLanguage(
        `SERVER_NOT_SUPPORTED_MODULE`,
        constants.resourceType.message,
        jRequest.languageCode,
      )}`,
    };
  }

  for (const prefix in moduleMap) {
    if (commandName.startsWith(`${prefix}.`)) {
      return await moduleMap[prefix](jRequest._txnId, jRequest);
    }
  }

  return {
    error_code: -1,
    error_message: `[${commandName}] ${commonFunctions.getResourceByLanguage(
      `SERVER_NOT_SUPPORTED_MODULE`,
      constants.resourceType.message,
      jRequest.languageCode,
    )}`,
  };
};
