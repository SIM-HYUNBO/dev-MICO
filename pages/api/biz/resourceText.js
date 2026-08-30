import { deploymentSystemCode } from "@/lib/tenantResolver";
"use strict";

import { logger } from "@/components/core/server/winston/logger";
import * as constants from "@/lib/constants";
import { SCHEMA } from "@/lib/dbSchema";
import * as commonFunctions from "@/lib/commonFunctions";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import { loadResourceTextRows } from "@/lib/resourceTextServer";
import { runService } from "@/lib/serviceRunner";
import { verifySession } from "@/lib/serverSession";

const SCHEMA_NAME = SCHEMA;

// 한 화면에 담기는 키 수. 목록은 키 단위라 행 수보다 훨씬 적다.
const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
// 리소스 본문에 문서 한 편이 들어갈 일은 없다. 사고로 거대한 값이 들어가면
// 화면 전체가 그 한 줄 때문에 무너지므로 입력 단계에서 자른다.
const MAX_TEXT_LENGTH = 4000;
const MAX_KEY_LENGTH = 200;

const KEY_FORMAT = /^[A-Za-z0-9_.-]+$/;
// 언어는 코드에 목록을 두지 않는다. 목록을 박아두면 언어가 하나 늘 때마다
// 서버를 고쳐 배포해야 하고, 그 전까지는 관리자가 새 언어를 넣을 수 없다.
// 형식만 본다 — BCP 47 의 흔한 꼴(ko, ko-KR, zh-Hant-TW)을 받는다.
const LANGUAGE_FORMAT = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/;

const messageFor = (key, languageCode) =>
  commonFunctions.getResourceByLanguage(key, constants.resourceType.message, languageCode);

const noPermission = (jRequest) => ({
  commandName: jRequest.commandName,
  error_code: constants.errorCode.ServerValidationError,
  error_message: messageFor("NO_PERMISSION", jRequest.languageCode),
});

const invalid = (jRequest, detail) => ({
  commandName: jRequest.commandName,
  error_code: constants.errorCode.ServerValidationError,
  error_message: detail,
});

// 관리자 확인 전에 세션부터 본다. 요청 본문의 userId 만 믿으면 관리자 ID 문자열만
// 알아도 화면 문구를 통째로 바꿀 수 있다. dbUsage 와 같은 방식이다.
const assertAdmin = async (jRequest) => {
  const authed = await verifySession(
    SCHEMA_NAME,
    deploymentSystemCode(),
    jRequest.userId,
    jRequest.sessionToken,
  );
  if (!authed) return false;

  const userSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_USER_MST", 1);
  const user = await database.executeSQL(userSql, [deploymentSystemCode(), jRequest.userId]);
  const flag = user.rows[0]?.admin_flag;
  return flag === true || String(flag).toUpperCase() === "Y" || String(flag) === "true";
};

// 빈 문자열과 공백만 있는 값은 "조건 없음"으로 본다. 그대로 넘기면
// ILIKE '%%' 가 되어 조건이 있는 척하면서 전건을 훑는다.
const optionalText = (value) => {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
};

// 검색어는 저장된 값과 같은 모양으로 맞춘 뒤에 쓴다.
//
// 왜
//   한글은 같은 글자를 두 가지로 담을 수 있다 — 완성형(NFC) 과 자모 분리형(NFD).
//   DB 에 들어 있는 값은 NFC 인데 입력기가 NFD 로 넣으면, 눈에는 똑같아 보여도
//   ILIKE 가 한 글자도 못 찾는다. 짧게 치면 우연히 걸리고 길게 칠수록 안 걸리는
//   식으로 나타나서, 검색이 고장 난 줄 모르고 "데이터가 없네" 로 읽힌다.
//
//   가운데 공백이 둘이거나 탭이 섞이는 것도 같은 결과를 낸다. 하나로 접는다.
//
//   %, _ 는 ILIKE 의 와일드카드다. 사용자가 친 그대로 찾게 이스케이프한다.
//   ILIKE 의 기본 이스케이프 문자는 백슬래시이므로 그것부터 먼저 처리한다.
const searchText = (value) => {
  const text = optionalText(value);
  if (text === null) return null;
  return text
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/[\\%_]/g, (ch) => `\\${ch}`);
};

const validResourceType = (value) => {
  const type = optionalText(value);
  if (type === null) return null;
  return type === constants.resourceType.label || type === constants.resourceType.message ? type : null;
};

// 저장·삭제는 화면 문구를 바꾸므로 서버가 들고 있는 캐시도 같이 맞춘다.
// 안 맞추면 서버가 만드는 메시지는 재기동 전까지 옛 값을 쓴다.
const refreshServerResourceCache = async (txnId) => {
  try {
    const rows = await loadResourceTextRows(deploymentSystemCode());
    commonFunctions.setResourceTextRows(rows);
  } catch (e) {
    // 저장 자체는 끝났다. 캐시 갱신 실패로 저장을 실패로 되돌리지 않는다.
    logger.warn(`[${txnId}] resource cache refresh failed: ${e.message}`);
  }
};

const selectKeyList = async (txnId, jRequest) => {
  if (!(await assertAdmin(jRequest))) return noPermission(jRequest);

  const systemCode = deploymentSystemCode();
  const resourceType = validResourceType(jRequest.resourceType);
  const keyFilter = searchText(jRequest.resourceKey);
  const textFilter = searchText(jRequest.text);
  const languageFilter = searchText(jRequest.targetLanguageCode);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(jRequest.pageSize) || PAGE_SIZE));
  const page = Math.max(1, Number(jRequest.page) || 1);
  const offset = (page - 1) * pageSize;

  const listSql = await dynamicSql.getSQL(systemCode, "select_TB_COR_RESOURCE_TEXT_KEY_LIST", 1);
  const countSql = await dynamicSql.getSQL(systemCode, "select_TB_COR_RESOURCE_TEXT_KEY_COUNT", 1);
  const filters = [systemCode, resourceType, keyFilter, textFilter, languageFilter];

  const [list, count] = await Promise.all([
    database.executeSQL(listSql, [...filters, pageSize, offset]),
    database.executeSQL(countSql, filters),
  ]);

  // 조건을 걸었는데 0건이면 로그에 조건을 남긴다.
  //
  // 왜
  //   "데이터가 있는데 검색이 안 된다" 는 신고가 들어오면, 화면만 보고는 조건이
  //   무엇으로 서버에 닿았는지 알 수 없다. 한글 입력은 눈에 같아 보여도 자모가
  //   분리돼 들어오거나 공백이 섞이는 일이 있어서, 값을 그대로 봐야 판단이 된다.
  //   0건일 때만 남기므로 평소에는 로그가 늘지 않는다.
  if ((count.rows[0]?.total_count ?? 0) === 0 && (keyFilter || textFilter || languageFilter)) {
    logger.info(
      `[${txnId}] resource text 검색 0건 — ` +
        `type=${resourceType ?? "-"} key=${JSON.stringify(keyFilter)} ` +
        `text=${JSON.stringify(textFilter)} lang=${JSON.stringify(languageFilter)}`,
    );
  }

  return {
    commandName: jRequest.commandName,
    error_code: constants.errorCode.Success,
    error_message: constants.emptyString,
    keys: list.rows || [],
    totalCount: count.rows[0]?.total_count ?? 0,
    page,
    pageSize,
  };
};

// 이 시스템이 실제로 쓰는 언어. 화면은 이 목록으로 편집칸을 만든다.
const selectLanguages = async (txnId, jRequest) => {
  if (!(await assertAdmin(jRequest))) return noPermission(jRequest);

  const systemCode = deploymentSystemCode();
  const sql = await dynamicSql.getSQL(systemCode, "select_TB_COR_RESOURCE_TEXT_LANGUAGE_LIST", 1);
  const result = await database.executeSQL(sql, [systemCode]);

  return {
    commandName: jRequest.commandName,
    error_code: constants.errorCode.Success,
    error_message: constants.emptyString,
    languages: (result.rows || []).map((row) => row.language_code).filter(Boolean),
  };
};

const selectDetail = async (txnId, jRequest) => {
  if (!(await assertAdmin(jRequest))) return noPermission(jRequest);

  const systemCode = deploymentSystemCode();
  const resourceType = validResourceType(jRequest.resourceType);
  const resourceKey = optionalText(jRequest.resourceKey);
  if (!resourceType || !resourceKey) {
    return invalid(jRequest, messageFor("SERVER_VALIDATION_ERROR", jRequest.languageCode));
  }

  const sql = await dynamicSql.getSQL(systemCode, "select_TB_COR_RESOURCE_TEXT_DETAIL", 1);
  const result = await database.executeSQL(sql, [systemCode, resourceType, resourceKey]);

  return {
    commandName: jRequest.commandName,
    error_code: constants.errorCode.Success,
    error_message: constants.emptyString,
    resourceType,
    resourceKey,
    rows: result.rows || [],
  };
};

// 언어 여러 줄을 한 번에 저장한다. 화면에서 3개 언어를 나란히 고치므로,
// 한 줄씩 왕복하면 일부만 저장된 상태가 눈에 보인다.
const saveTexts = async (txnId, jRequest) => {
  if (!(await assertAdmin(jRequest))) return noPermission(jRequest);

  const systemCode = deploymentSystemCode();
  const resourceType = validResourceType(jRequest.resourceType);
  const resourceKey = optionalText(jRequest.resourceKey);
  const texts = jRequest.texts;

  if (!resourceType || !resourceKey || !commonFunctions.isJsonObject(texts)) {
    return invalid(jRequest, messageFor("SERVER_VALIDATION_ERROR", jRequest.languageCode));
  }
  if (resourceKey.length > MAX_KEY_LENGTH || !KEY_FORMAT.test(resourceKey)) {
    return invalid(jRequest, messageFor("SERVER_VALIDATION_ERROR", jRequest.languageCode));
  }

  const entries = Object.entries(texts);
  if (entries.length === 0 || entries.some(([language]) => !LANGUAGE_FORMAT.test(language))) {
    return invalid(jRequest, messageFor("SERVER_VALIDATION_ERROR", jRequest.languageCode));
  }
  if (entries.some(([, text]) => String(text ?? "").length > MAX_TEXT_LENGTH)) {
    return invalid(jRequest, messageFor("SERVER_VALIDATION_ERROR", jRequest.languageCode));
  }

  // 빈 값은 저장하지 않는다.
  //
  // 왜
  //   키가 없으면 화면에 [리소스 없음:...] 경고가 떠서 빠진 것을 바로 안다. 그런데
  //   빈 문자열 행이 있으면 아무것도 그리지 않아 라벨이 사라진 것처럼 보인다.
  //   안 보이는 글씨는 빠진 글씨보다 찾기 어렵다. 지우는 것은 삭제로만 한다.
  const filled = entries.filter(([, text]) => String(text ?? "").trim() !== "");
  if (filled.length === 0) {
    return invalid(jRequest, messageFor("RESOURCE_TEXT_EMPTY", jRequest.languageCode));
  }

  const upsertSql = await dynamicSql.getSQL(systemCode, "upsert_TB_COR_RESOURCE_TEXT", 1);
  for (const [language, text] of filled) {
    await database.executeSQL(upsertSql, [
      systemCode,
      resourceType,
      resourceKey,
      language,
      String(text),
      jRequest.userId,
    ]);
  }

  await refreshServerResourceCache(txnId);
  logger.info(
    `[${txnId}] resource text saved: ${resourceType}/${resourceKey} ` +
      `(${filled.length} languages) by ${jRequest.userId}`,
  );

  return {
    commandName: jRequest.commandName,
    error_code: constants.errorCode.Success,
    error_message: constants.emptyString,
    savedCount: filled.length,
  };
};

const deleteTexts = async (txnId, jRequest) => {
  if (!(await assertAdmin(jRequest))) return noPermission(jRequest);

  const systemCode = deploymentSystemCode();
  const resourceType = validResourceType(jRequest.resourceType);
  const resourceKey = optionalText(jRequest.resourceKey);
  // 언어를 주면 그 한 줄만, 안 주면 그 키 전체를 지운다.
  const languageCode = optionalText(jRequest.targetLanguageCode);

  if (!resourceType || !resourceKey) {
    return invalid(jRequest, messageFor("SERVER_VALIDATION_ERROR", jRequest.languageCode));
  }
  if (languageCode && !LANGUAGE_FORMAT.test(languageCode)) {
    return invalid(jRequest, messageFor("SERVER_VALIDATION_ERROR", jRequest.languageCode));
  }

  const sql = await dynamicSql.getSQL(systemCode, "delete_TB_COR_RESOURCE_TEXT", 1);
  const result = await database.executeSQL(sql, [systemCode, resourceType, resourceKey, languageCode]);

  await refreshServerResourceCache(txnId);
  logger.info(
    `[${txnId}] resource text deleted: ${resourceType}/${resourceKey}/${languageCode || "all"} by ${jRequest.userId}`,
  );

  return {
    commandName: jRequest.commandName,
    error_code: constants.errorCode.Success,
    error_message: constants.emptyString,
    deletedCount: result.rowCount ?? 0,
  };
};

const executeService = (txnId, jRequest) =>
  runService(txnId, jRequest, async () => {
    switch (jRequest.commandName) {
      case constants.commands.RESOURCE_TEXT_KEY_LIST:
        return selectKeyList(txnId, jRequest);
      case constants.commands.RESOURCE_TEXT_LANGUAGE_LIST:
        return selectLanguages(txnId, jRequest);
      case constants.commands.RESOURCE_TEXT_DETAIL:
        return selectDetail(txnId, jRequest);
      case constants.commands.RESOURCE_TEXT_SAVE:
        return saveTexts(txnId, jRequest);
      case constants.commands.RESOURCE_TEXT_DELETE:
        return deleteTexts(txnId, jRequest);
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
