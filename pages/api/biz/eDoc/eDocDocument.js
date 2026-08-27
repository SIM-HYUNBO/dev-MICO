import { deploymentSystemCode } from "@/lib/tenantResolver";
import { logger } from "@/components/core/server/winston/logger";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import * as textProvider from "@/components/core/server/aiContentProvider/textProvider";
import { decryptApiKey } from "@/lib/byokEncryption";
import { verifySession } from "@/lib/serverSession";
import { SCHEMA_NAME } from "@/lib/dbSchema";

// 문서 AI 생성 provider 순서 — 무료(cerebras→groq→gemini→pollinations) 우선, 유료(claude→openai)는 폴백.
// OpenAI 크레딧이 없어도 무료 스택으로 생성되게 한다(AI Studio와 동일 스택).
const EDOC_FREE_TEXT_PROVIDER_ORDER = ["cerebras", "groq", "gemini", "pollinations", "claude", "openai"];
// 문서 JSON은 컴포넌트 보일러플레이트까지 담아 커서, 기본 텍스트 상한(4000)이면 잘려 파싱 실패한다.
// 문서 생성에는 넉넉한 상한을 준다(AI Studio 등 다른 호출은 기본값 유지).
const EDOC_MAX_TOKENS = parseInt(process.env.AIC_EDOC_MAX_TOKENS || "16000", 10);
const EDOC_TEXT_BYOK_PROVIDERS = ["openai", "anthropic", "gemini", "groq", "cerebras"];
const EDOC_CALLER_OF_BYOK = { openai: "openai", anthropic: "claude", gemini: "gemini", groq: "groq", cerebras: "cerebras" };
const EDOC_PAID_TEXT_PROVIDERS = ["claude", "openai"];
const EDOC_TEXT_CREDIT_COST = parseInt(process.env.AIC_TEXT_CREDIT_COST || "1", 10);
const EDOC_CREDIT_STARTER = parseInt(process.env.AIC_CREDIT_STARTER || "100", 10);
const EDOC_CREDIT_INITIAL_GRANT_USERS = (process.env.AIC_CREDIT_UNLIMITED_USERS || "Stella")
  .split(",").map((s) => s.trim()).filter(Boolean);
const EDOC_CREDIT_INITIAL_GRANT = 1000000;
const EDOC_MODEL_OPTIONS = [
  { id: "free-auto", labelKey: "edocAiProviderFreeAuto", owned_by: "brunner" },
  { id: "user-key-auto", labelKey: "edocAiProviderUserKeyAuto", owned_by: "user" },
  { id: "groq", labelKey: "aiStudioProviderGroq", owned_by: "groq" },
  { id: "gemini", labelKey: "aiStudioProviderGemini", owned_by: "google" },
  { id: "cerebras", labelKey: "aiStudioProviderCerebras", owned_by: "cerebras" },
];

const loadEDocByokKeys = async (systemCode, userId) => {
  const keys = {};
  if (!userId) return keys;
  const sql = await dynamicSql.getSQL(systemCode, "select_TB_COR_PROVIDER_AI_KEY", 2);
  for (const provider of EDOC_TEXT_BYOK_PROVIDERS) {
    const r = await database.executeSQL(sql, [systemCode, userId, provider]);
    const row = r.rows?.[0];
    if (row?.key_ciphertext) keys[provider] = decryptApiKey(row.key_ciphertext);
  }
  return keys;
};

const buildEDocTextProviderOrder = (apiKeys = {}) => {
  const byokFirst = EDOC_TEXT_BYOK_PROVIDERS
    .filter((provider) => apiKeys[provider])
    .map((provider) => EDOC_CALLER_OF_BYOK[provider]);
  return [...byokFirst, ...EDOC_FREE_TEXT_PROVIDER_ORDER].filter(
    (provider, index, arr) => provider && arr.indexOf(provider) === index,
  );
};

const normalizeEDocProvider = (selectedModel) => {
  const provider = String(selectedModel || "").toLowerCase();
  return EDOC_FREE_TEXT_PROVIDER_ORDER.includes(provider) ? provider : undefined;
};

const isEDocByokProvider = (apiKeys, provider) =>
  EDOC_TEXT_BYOK_PROVIDERS.some((keyProvider) => apiKeys[keyProvider] && EDOC_CALLER_OF_BYOK[keyProvider] === provider);

const adjustEDocCredit = async (systemCode, userId, delta, reason, ref) => {
  const upd = await dynamicSql.getSQL(systemCode, "update_TB_COR_CREDIT_MST", 1);
  const r = await database.executeSQL(upd, [systemCode, userId, delta]);
  const balance = r.rows?.[0]?.balance ?? 0;
  const led = await dynamicSql.getSQL(systemCode, "insert_TB_COR_CREDIT_LEDGER", 1);
  await database.executeSQL(led, [systemCode, commonFunctions.generateUUID(), userId, delta, balance, reason || null, ref || null]);
  return balance;
};

const ensureEDocCredit = async (systemCode, userId) => {
  const sel = await dynamicSql.getSQL(systemCode, "select_TB_COR_CREDIT_MST", 1);
  const r = await database.executeSQL(sel, [systemCode, userId]);
  if (r.rows?.length) return r.rows[0].balance;
  const initial = EDOC_CREDIT_INITIAL_GRANT_USERS.includes(userId) ? EDOC_CREDIT_INITIAL_GRANT : EDOC_CREDIT_STARTER;
  return adjustEDocCredit(systemCode, userId, initial, EDOC_CREDIT_INITIAL_GRANT_USERS.includes(userId) ? "initial_grant" : "starter", null);
};

const spendEDocCreditIfEnough = async (systemCode, userId, amount, reason, ref) => {
  const upd = await dynamicSql.getSQL(systemCode, "update_TB_COR_CREDIT_MST", 2);
  const r = await database.executeSQL(upd, [systemCode, userId, amount]);
  if (!r.rows?.length) return { ok: false };
  const balance = r.rows[0].balance;
  const led = await dynamicSql.getSQL(systemCode, "insert_TB_COR_CREDIT_LEDGER", 1);
  await database.executeSQL(led, [systemCode, commonFunctions.generateUUID(), userId, -amount, balance, reason || null, ref || null]);
  return { ok: true, balance };
};

// 무료 모델이 ```json 코드펜스나 앞뒤 잡설을 붙여도 JSON만 안전하게 추출한다.
const extractDocJson = (s) => {
  let t = String(s || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) t = t.slice(first, last + 1);
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

const DEFAULT_AI_DOC_RUNTIME_DATA = {
  title: "New Document",
  description: "신규 문서",
  isPublic: false,
  backgroundColor: "#ffffff",
  padding: 1,
  menu_path: null,
};

const normalizeGeneratedDoc = (doc) => {
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.pages) || doc.pages.length === 0) {
    return null;
  }

  const pages = doc.pages
    .filter((page) => page && typeof page === "object")
    .map((page, index) => ({
      ...page,
      id: page.id || `page-${index + 1}`,
      components: Array.isArray(page.components) ? page.components : [],
      runtime_data: {
        padding: 24,
        alignment: "center",
        backgroundColor: "#ffffff",
        pageSize: "A4",
        ...(page.runtime_data || {}),
      },
    }));

  if (pages.length === 0) return null;

  return {
    ...doc,
    id: doc.id || null,
    runtime_data: {
      ...DEFAULT_AI_DOC_RUNTIME_DATA,
      ...(doc.runtime_data || {}),
    },
    pages,
  };
};

const isValidGeneratedDoc = (text) => !!normalizeGeneratedDoc(extractDocJson(text));

const executeService = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    switch (jRequest.commandName) {
      case constants.commands.EDOC_DOCUMENT_UPSERT_ONE:
        jResponse = await upsertOne(txnId, jRequest);
        break;
      case constants.commands.EDOC_DOCUMENT_SELECT_ONE:
        jResponse = await selectOne(txnId, jRequest);
        break;
      case constants.commands.EDOC_DOCUMENT_DELETE_ONE:
        jResponse = await deleteOne(txnId, jRequest);
        break;
      case constants.commands.EDOC_USER_DOCUMENT_SELECT_ALL: // user all documents
        jResponse = await selectUserAll(txnId, jRequest);
        break;
      case constants.commands.EDOC_ADMIN_DOCUMENT_SELECT_ALL: // admin & public documents
        jResponse = await selectAdminAll(txnId, jRequest);
        break;
      case constants.commands.EDOC_AI_GENERATE_DOCUMENT:
        jResponse = await generateDocumentWithOpenAI(txnId, jRequest);
        break;
      case constants.commands.EDOC_AI_GET_MODEL_LIST:
        jResponse = await getAIModelList(txnId, jRequest);
        break;
      default:
        throw new Error(
          commonFunctions.getResourceByLanguage(
            `SERVER_NOT_SUPPORTED_METHOD`,
            constants.resourceType.message,
            jRequest.languageCode,
          ),
        );
        break;
    }
  } catch (e) {
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
    logger.error(`message:${e.message}\n stack:${e.stack}\n`);
  } finally {
    return jResponse;
  }
};

const upsertOne = async (txnId, jRequest) => {
  const jResponse = {};
  let isInsert = null;

  try {
    jResponse.commandName = jRequest.commandName;

    if (!jRequest.documentData) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [documentData]`;
      return jResponse;
    }

    if (!jRequest.documentData.id) {
      jRequest.documentData.id = commonFunctions.generateUUID();

      if (!jRequest.documentData.runtime_data.title) {
        jRequest.documentData.runtime_data.title = "New document";
      }

      if (!jRequest.documentData.runtime_data.description) {
        jRequest.documentData.runtime_data.description = "New document";
      }

      isInsert = true; // insert
    } else {
      isInsert = false; // update
    }

    if (!jRequest.documentData.runtime_data.title) {
      jRequest.documentData.runtime_data.title =
        commonFunctions.getResourceByLanguage(
          `EMPTY_STRING`,
          constants.resourceType.message,
          jRequest.languageCode,
        );
    }

    // ✅ pages는 필수 JSON
    if (!jRequest.documentData.pages) {
      jRequest.documentData.pages = [];
    }

    if (isInsert) {
      // INSERT
      const sql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "insert_TB_COR_EDOC_DOCUMENT",
        1,
      );

      var insert_TB_COR_EDOC_DOCUMENT_01 = await database.executeSQL(sql, [
        deploymentSystemCode(),
        jRequest.documentData.id,
        jRequest.documentData.runtime_data.title,
        jRequest.documentData.runtime_data.description,
        1, // version
        jRequest.userId,
        JSON.stringify(jRequest.documentData.runtime_data || {}),
        JSON.stringify(jRequest.documentData.pages || []),
        jRequest.documentData.runtime_data.menu_path,
      ]);

      if (insert_TB_COR_EDOC_DOCUMENT_01.rowCount !== 1) {
        jResponse.error_code = constants.errorCode.DBCUDError;
        jResponse.error_message = commonFunctions.getResourceByLanguage(
          `FAILED_TO_SAVE_DATA`,
          constants.resourceType.message,
          jRequest.languageCode,
        );
        return jResponse;
      }
    } else {
      // UPDATE
      const sql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "update_TB_COR_EDOC_DOCUMENT",
        1,
      );

      var update_TB_COR_EDOC_DOCUMENT_01 = await database.executeSQL(sql, [
        deploymentSystemCode(),
        jRequest.documentData.id,
        jRequest.documentData.runtime_data.title,
        jRequest.documentData.runtime_data.description,
        jRequest.userId,
        JSON.stringify(jRequest.documentData.runtime_data || {}),
        JSON.stringify(jRequest.documentData.pages || []),
        jRequest.documentData.runtime_data.menu_path,
      ]);

      if (update_TB_COR_EDOC_DOCUMENT_01.rowCount !== 1) {
        jResponse.error_code = constants.errorCode.DBCUDError;
        jResponse.error_message = commonFunctions.getResourceByLanguage(
          `FAILED_TO_SAVE_DATA`,
          constants.resourceType.message,
          jRequest.languageCode,
        );
        return jResponse;
      }
    }

    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = commonFunctions.getResourceByLanguage(
      `SUCCESS_SAVED`,
      constants.resourceType.message,
      jRequest.languageCode,
    );
    jResponse.documentData = jRequest.documentData;
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};


/**
 * 세션으로 확인한 관리자인가.
 *
 * 요청 본문의 userId 만 믿으면 관리자 ID 문자열만 알아도 통과한다. 세션을 먼저 보고,
 * 그 다음 사용자 테이블의 admin_flag 를 본다. (dbUsage 의 assertAdmin 과 같은 방식)
 */
const isAdminRequester = async (jRequest) => {
  // 브라우저의 "일반 사용자 모드"를 존중한다. 관리자가 그 모드로 내렸으면 관리자
  // 문서를 내주지 않는다. 이 값은 권한을 줄이기만 하므로 믿어도 안전하다.
  if (jRequest.adminMode === false) return false;

  const authed = await verifySession(
    SCHEMA_NAME,
    jRequest.systemCode,
    jRequest.userId,
    jRequest.sessionToken,
  );
  if (!authed) return false;
  try {
    const userSql = await dynamicSql.getSQL(jRequest.systemCode, "select_TB_COR_USER_MST", 1);
    const user = await database.executeSQL(userSql, [jRequest.systemCode, jRequest.userId]);
    const flag = user.rows[0]?.admin_flag;
    return flag === true || String(flag).toUpperCase() === "Y" || String(flag) === "true";
  } catch (e) {
    logger.error(e);
    return false;
  }
};

/**
 * 문서 한 건을 읽을 수 있는가.
 *
 * 왜 필요한가
 *   목록(selectAdminAll)은 isPublic 으로 거르는데 단건 조회에는 아무 조건이 없어서,
 *   목록에 뜨지 않는 문서도 ID 만 알면 인증 없이 그대로 내려왔다. 문서 ID 는 고정 키에서
 *   만드는 결정적 UUID 라 계산도 가능했다. 실제로 로그인 없이 계약 문서 전체가 조회됐다.
 *
 * 무엇을 기준으로 하나
 *   전자문서 모델에 원래 있는 것만 쓴다 — isPublic(디자이너가 설정하는 공개 여부),
 *   created_by(소유자), 사용자의 admin_flag. runtime_data.adminOnly 는 동기화 스크립트가
 *   메뉴 노출용으로 심어 넣은 값이라 문서의 범용 속성이 아니므로 권한 판정에 쓰지 않는다.
 */
const canReadDocument = async (jRequest, row, runtimeData) => {
  const isPublic =
    runtimeData?.isPublic === true || String(runtimeData?.isPublic) === "true";
  if (isPublic) return true;

  // 비공개 문서는 본인이거나 관리자만. 요청 본문의 userId 는 믿지 않고 세션으로 확인한다.
  const authed = await verifySession(
    SCHEMA_NAME,
    jRequest.systemCode,
    jRequest.userId,
    jRequest.sessionToken,
  );
  if (!authed) return false;

  if (row?.created_by && row.created_by === jRequest.userId) return true;

  return isAdminRequester(jRequest);
};

const selectOne = async (txnId, jRequest) => {
  const jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;

    if (!jRequest.documentId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [documentData.id]`;
      return jResponse;
    }

    // ✅ TB_COR_EDOC_DOCUMENT에서 pages 포함 가져오기
    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_EDOC_DOCUMENT",
      1,
    );

    var select_TB_COR_EDOC_DOCUMENT_01 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.documentId,
    ]);

    if (select_TB_COR_EDOC_DOCUMENT_01.rowCount < 1) {
      jResponse.error_code = constants.errorCode.Success;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `NO_DATA_FOUND`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
      return jResponse;
    }

    const row = select_TB_COR_EDOC_DOCUMENT_01.rows[0];

    // JSONB 컬럼은 보통 객체로 오지만, 레거시 TEXT 행·환경차로 문자열일 수 있어 방어적으로 파싱한다.
    // (문자열이 그대로 넘어가면 클라이언트의 pages.map 등이 깨져 문서 내용이 통째로 유실됨)
    const parseMaybe = (v, fallback) => {
      if (v == null) return fallback;
      if (typeof v === "string") { try { return JSON.parse(v); } catch { return fallback; } }
      return v;
    };
    const pages = parseMaybe(row.pages, []);
    const runtimeData = parseMaybe(row.runtime_data, {});
    if (!(await canReadDocument(jRequest, row, runtimeData))) {
      jResponse.error_code = constants.errorCode.Success;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `NO_DATA_FOUND`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
      return jResponse;
    }

    const rowTitle = typeof row.title === "string" ? row.title.trim() : "";
    const runtimeTitle = typeof runtimeData.title === "string" ? runtimeData.title.trim() : "";
    const shouldUseRowTitle =
      rowTitle &&
      (!runtimeTitle || runtimeTitle === "New Document" || runtimeTitle === "New document");
    const normalizedRuntimeData = {
      ...runtimeData,
      title: shouldUseRowTitle ? rowTitle : runtimeData.title,
      description:
        shouldUseRowTitle && (!runtimeData.description || runtimeData.description === "신규 문서")
          ? rowTitle
          : runtimeData.description,
    };
    const documentData = {
      id: row.id,
      title: row.title,
      description: row.description,
      version: row.version,
      runtime_data: normalizedRuntimeData,
      pages: Array.isArray(pages) ? pages : [],
    };

    jResponse.documentData = documentData;
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

const deleteOne = async (txnId, jRequest) => {
  const jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;

    if (!jRequest.documentId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = `${commonFunctions.getResourceByLanguage(
        `REQUIRED_FIELD`,
        constants.resourceType.message,
        jRequest.languageCode,
      )} [documentId]`;
      return jResponse;
    }

    // TB_COR_EDOC_DOCUMENT 삭제만 수행
    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "delete_TB_COR_EDOC_DOCUMENT",
      1,
    );

    var delete_TB_COR_EDOC_DOCUMENT_01 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.documentId,
    ]);

    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = commonFunctions.getResourceByLanguage(
      `SUCCESS_DELETED`,
      constants.resourceType.message,
      jRequest.languageCode,
    );
    jResponse.documentData = jRequest.documentData; // optional
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const selectUserAll = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;

    // select TB_COR_EDOC_DOCUMENT
    var sql = null;
    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_EDOC_DOCUMENT",
      2,
    );

    var select_TB_COR_EDOC_DOCUMENT_02 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.userId,
    ]);

    jResponse.documentList = select_TB_COR_EDOC_DOCUMENT_02.rows;

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

// 관리자가 작성한 공용문서 전체 목록 조회
const selectAdminAll = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;

    // select TB_COR_EDOC_DOCUMENT
    // 관리자면 전체를, 아니면 공개 문서만 돌려준다.
    // 목록이 공개 여부만 보고 단건 조회는 아무 조건이 없던 탓에, 목록에 안 뜨는 문서도
    // ID 만 알면 열렸다. 두 경로가 같은 기준을 쓰게 맞춘다.
    const admin = await isAdminRequester(jRequest);
    var sql = null;
    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_EDOC_DOCUMENT",
      admin ? 4 : 3,
    );

    var select_TB_COR_EDOC_DOCUMENT_03 = await database.executeSQL(sql, [
      deploymentSystemCode(),
    ]);

    jResponse.documentList = select_TB_COR_EDOC_DOCUMENT_03.rows;

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

// 관리자가 작성한 공용문서 전체 목록 조회 및 AI 문서 자동 생성
// lib/autoGenerateDocument.js
export const generateDocumentWithOpenAI = async (txnId, jRequest) => {
  let jResponse = {};
  var prompts = [];

  try {
    const prompt = `
지시사항: ${jRequest.instructionInfo.instructions}

아래 지시사항에 따라 답변내용을 문서로 작성하라.
아래 제공되는 JSON 형식으로만 문서를 생성하라. 
필요에 따라 아래 기본 컴포넌트를 사용할 수 있다.

1. 텍스트(text) : 
텍스트로 문장들을 입력하고 단락(문단)을 구성하는 컴포넌트이다. 
이 컴포넌트로 문단내에 여러 문장을 넣을 수 있다. 
컴포넌트 내에서 줄바꿈이 가능하므로 동일 단락이면 한개의 텍스트 컴포넌트를 사용한다.
문장이 여러개라도 불필요하게 여러개의 텍스트 컴포넌트를 사용하지 않는다.
2. 체크리스트(checklist): 
여러 종류의 옵션(보기)이 있고 선택여부 체크를 표현하는 컴포넌트이다.
3. 입력란(input): 
텍스트로 단일 문장을 사용자가 입력할 수 있게 하는 컴포넌트이다.
4. 이미지(image): 
문서에 외부 이미지를 삽입할 필요가 있을때 사용하는 컴포넌트이다.
웹상에 있는 적합한 이미지의 정확한 URL이 확인되는 이미지를 설정하여 문서에서 표시하면 훨씬 유리하다.
이미지 소스가 없거나 제대로 표시할 수 없으면 추가하지 않는다. 
Base64형식으로 전환하여 넣을 수 있다.
5. 버튼(button): 
사용자가 클릭하게 할 수 있고 필요에 따라 외부 Restful API를 호출할 속성값들을 설정하여 호출할 수 있는 컴포넌트이다.
호스트가 127.0.0.1인 url은 사용할 수 없다.
6. 테이블(table): 
문서내에 표를 삽입하고 표 데이터를 구성하고 표시하는 컴포넌트이다.
columns에 컬럼 헤더 값들을 설정하고 각 행 데이터 값은 data에 따로 구분해서 저장한다.
표를 그리면서 컬럼헤더 값은 columns에만 설정하고 data의 첫행에 중복해서  컬럼제목을 저장하지 않도록 주의한다.
7. 동영상(video) : 
문서에 동영상을 삽입하는 컴포넌트이다. 
웹상에 있는 적합한 동영상의 정확한 URL을 설정하여 문서에서 재생할 수 있게 하면 훨씬 유리하다.
8. 링크 텍스트(linkText)
문서내용과 관련해서 웹상에 있는 적합한 참고할 만한 외부 다른 사이트 페이지로 링크 가능한 텍스트 컴포넌트이다.
해당 페이지의 Url 정보와 문서 제목등 연결될 텍스트 값을 설정해서 링크한다.
외부 페이지를 링크하면 훨씬 유리하다.
9. Lottie Animation
문서내용과 관련해서 Json문자열로 Animation을 제공하는 Lottie Animation 컴포넌트이다.
JsonString 속성을 설정해서 애니메이션을 삽입할 수 있다.


JSON 문서 포맷은 아래와 같고 상기 컴포넌트의 기본값을 모두 포함하고 있다.
참고해서 값을 채워서 완성된 문서로 생성한다.
사용하는 모델에 제한이 있으면 자동으로 하위 모델로 선택해서 작업하면 된다.

{
  "id": null,
  "runtime_data": {
    "title": "New Document",
    "description": "신규 문서",
    "isPublic": false,
    "backgroundColor": "#ffffff",
    "padding": 1,
    "menu_path": null
  },
  "pages": [
    {
      "id": "page-1",
      "components": [
        {
          "id": "5e2013b1-7934-4a29-9d16-8da5e5e1b353",
          "name": "체크리스트",
          "type": "Checklist",
          "description": "체크리스트",
          "template_json": {
            "type": "Checklist",
            "itemCount": 3,
            "textAlign": "left"
          },
          "version": 1,
          "is_active": true,
          "created_at": "2025-06-14T03:54:50.147Z",
          "updated_at": "2025-06-14T03:54:50.147Z",
          "runtime_data": {
            "width": "auto",
            "height": "",
            "forceNewLine": true,
            "itemCount": 3,
            "items": [
              { "label": "항목 1", "checked": false },
              { "label": "항목 2", "checked": false },
              { "label": "항목 3", "checked": false }
            ],
            "positionAlign": "left",
            "fontFamily": "Arial",
            "fontSize": 12,
            "underline": false,
            "fontColor": "#000000",
            "backgroundColor": "#ffffff",
            "fontWeight": "normal"
          }
        },
        {
          "id": "66b2f0cc-8e2f-454f-ac47-dc5703ef5be5",
          "name": "입력란",
          "type": "Input",
          "description": "사용자 입력을 받는 필드 컴포넌트",
          "template_json": {
            "type": "Input",
            "textAlign": "left",
            "placeholder": "값을 입력하세요"
          },
          "version": 1,
          "is_active": true,
          "created_at": "2025-06-11T23:18:51.489Z",
          "updated_at": "2025-06-11T23:18:51.489Z",
          "runtime_data": {
            "width": "auto",
            "height": "",
            "forceNewLine": true,
            "placeholder": "여기에 값을 입력하세요",
            "textAlign": "left",
            "positionAlign": "left",
            "fontFamily": "Arial",
            "fontSize": 12,
            "underline": false,
            "fontColor": "#000000",
            "backgroundColor": "#ffffff",
            "fontWeight": "normal",
            "editable": true
          }
        },
        {
          "id": "7f05c7a9-0364-4896-9e9e-bc2bbe383cf7",
          "name": "이미지",
          "type": "Image",
          "description": "이미지를 삽입할 수 있는 컴포넌트",
          "template_json": { "src": "", "type": "Image" },
          "version": 1,
          "is_active": true,
          "created_at": "2025-06-11T23:18:51.950Z",
          "updated_at": "2025-06-11T23:18:51.950Z",
          "runtime_data": {
            "width": "auto",
            "height": "",
            "forceNewLine": true,
            "src": "",
            "positionAlign": "center",
            "fontFamily": "Arial",
            "fontSize": 12,
            "underline": false,
            "fontColor": "#000000",
            "backgroundColor": "#ffffff",
            "fontWeight": "normal"
          }
        },
        {
          "id": "9013173d-645b-4718-8f76-01dc3d252592",
          "name": "텍스트",
          "type": "Text",
          "description": "단일 줄 또는 여러 줄 텍스트 컴포넌트",
          "template_json": {
            "type": "Text",
            "content": "여기에 내용을 입력하세요.",
            "textAlign": "left"
          },
          "version": 1,
          "is_active": true,
          "created_at": "2025-06-11T23:18:51.722Z",
          "updated_at": "2025-06-11T23:18:51.722Z",
          "runtime_data": {
            "width": "auto",
            "height": "",
            "forceNewLine": true,
            "content": "여기에 텍스트를 설정하세요",
            "textAlign": "left",
            "positionAlign": "left",
            "fontFamily": "Arial",
            "fontSize": 12,
            "underline": false,
            "fontColor": "#000000",
            "backgroundColor": "#ffffff",
            "fontWeight": "normal"
          }
        },
        {
          "id": "a1c2e3f4-5678-1234-9abc-def012345678",
          "name": "링크 텍스트",
          "type": "LinkText",
          "description": "외부 사이트 링크 텍스트 컴포넌트 기본 템플릿",
          "template_json": {
            "url": "https://example.com",
            "type": "LinkText",
            "content": "링크 텍스트를 입력하세요",
            "fontSize": 12,
            "fontColor": "#1a0dab",
            "textAlign": "left",
            "underline": true,
            "fontFamily": "Arial",
            "fontWeight": "normal",
            "originalWidth": 200,
            "originalHeight": 30,
            "backgroundColor": "transparent"
          },
          "version": 1,
          "is_active": true,
          "created_at": "2025-08-24T02:00:00.000Z",
          "updated_at": "2025-08-24T02:00:00.000Z",
          "runtime_data": {
            "width": "auto",
            "height": "",
            "forceNewLine": true,
            "content": "여기에 링크 텍스트를 설정하세요",
            "url": "https://example.com",
            "textAlign": "left",
            "positionAlign": "left",
            "fontFamily": "Arial",
            "fontSize": 12,
            "underline": true,
            "fontColor": "#1a0dab",
            "backgroundColor": "transparent",
            "fontWeight": "normal"
          }
        },
        {
          "id": "a3f5c6d2-9e8b-4a72-8d92-0b6f2c4a9c13",
          "name": "버튼",
          "type": "Button",
          "description": "사용자 요청을 처리하는 버튼 컴포넌트",
          "template_json": {
            "type": "Button",
            "padding": "10px 20px",
            "textColor": "#FFFFFF",
            "buttonText": "버튼",
            "buttonColor": "#4F46E5",
            "borderRadius": "6px"
          },
          "version": 1,
          "is_active": true,
          "created_at": "2025-06-11T23:18:51.489Z",
          "updated_at": "2025-06-11T23:18:51.489Z",
          "runtime_data": {
            "width": "auto",
            "height": "",
            "forceNewLine": true,
            "buttonText": "버튼",
            "actionName": "",
            "buttonColor": "#4F46E5",
            "textColor": "#FFFFFF",
            "padding": "10px 20px",
            "borderRadius": "6px"
          }
        },
        {
          "id": "a787f5bf-8166-40c3-be68-457e63cd1767",
          "name": "테이블",
          "type": "Table",
          "description": "행과 열이 지정된 기본 테이블 컴포넌트",
          "template_json": { "columnCount": 3, "rowCount": 3, "type": "Table" },
          "version": 1,
          "is_active": true,
          "created_at": "2025-06-11T23:18:52.178Z",
          "updated_at": "2025-06-11T23:18:52.178Z",
          "runtime_data": {
            "width": "auto",
            "height": "",
            "forceNewLine": true,
            "columnCount": 3,
            "rowCount": 3,
            "rows": [["", "", ""], ["", "", ""], ["", "", ""]],
            "columns": [
              { "width": "33%", "header": "Header1", "align": "center" },
              { "width": "200px", "header": "Header2", "align": "center" },
              { "width": "auto", "header": "Header3", "align": "center" }
            ],
            "positionAlign": "left",
            "fontFamily": "Arial",
            "fontSize": 12,
            "underline": false,
            "fontColor": "#000000",
            "backgroundColor": "#ffffff",
            "fontWeight": "normal"
          }
        },
        {
          "id": "b2df4fd7-aad2-4554-8bde-db9e22229ec7",
          "name": "동영상",
          "type": "Video",
          "description": "영상 컴포넌트 기본 템플릿",
          "template_json": {
            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "type": "video",
            "textAlign": "center",
            "originalWidth": 640,
            "originalHeight": 360
          },
          "version": 1,
          "is_active": true,
          "created_at": "2025-07-17T02:54:43.616Z",
          "updated_at": "2025-07-17T02:54:43.616Z",
          "runtime_data": {
            "width": "auto",
            "height": "",
            "forceNewLine": true,
            "url": "",
            "title": "영상 제목",
            "originalWidth": 640,
            "originalHeight": 360
          }
        },
        {
          "id": "71247dd2-8c1a-4f27-82f5-cdd6a3777b0f",
          "name": "Lottie",
          "type": "Lottie",
          "version": 1,
          "is_active": true,
          "created_at": "2025-09-09T19:23:22.243Z",
          "updated_at": "2025-09-09T19:23:22.243Z",
          "description": "Lottie애니메이션",
          "runtime_data": {
            "loop": true,
            "width": "500px",
            "height": 200,
            "autoplay": true,
            "jsonString": "{}",
            "forceNewLine": true,
            "positionAlign": "center"
          }
        }
      ],
      "runtime_data": {
        "padding": 24,
        "alignment": "center",
        "backgroundColor": "#ffffff",
        "pageSize": "A4"
      }
    }
  ]
}
`;

    const systemPrompt = `너는 문서 작성 도우미야. JSON 형식으로만 문서를 만들어야 한다.
  ### 먼저 다음 규칙을 메모리에 업데이트 해주세요.
1.충분한 근거가 없거나 정보가 불확실할 경우, 임의로 답변하지 말고 '알 수 없습니다' 또는 '근거가 부족합니다'라고 답변하세요.
2.답변을 생성하기 전에 가능한 정보를 단계별로 검증하고, 출처가 명확하지 않은 부분은 '확실하지 않음'이라고 표시하세요.
3.확실한 근거 없이 추측이 포함될 경우, '추측한 내용입니다'라고 밝혀주세요.
4.답변은 자세하고, 객관적이며, 전문성을 유지하도록 구성하세요.
5.답변의 근거를 명확히 제시하고, 신뢰할 수 있는 출처가 있는 경우 해당 정보를 함께 제공하세요.
6.출처가 있는 경우, 해당 정보를 명확히 밝히고 간단히 요약하여 제공하세요.
### 앞으로 모든 대화에 이 규칙을 적용합니다.
  `;
    const userPrompt = prompt;
    const assistantPrompt = `반드시 JSON만 반환하고, 코드나 주석은 포함하지 않아야 합니다.`;

    // 무료 provider 스택으로 생성(OpenAI 크레딧 불필요). JSON 강제 지시를 userPrompt에 합친다.
    // 언어 순도 필터는 skipPurity로 끈다(아래) — languageCode 미전달은 ko-KR로 폴백돼 한자·가나를 지우기 때문.
    const selectedModel = jRequest.instructionInfo.aiModel || "free-auto";
    const useByok = selectedModel === "user-key-auto" || jRequest.useByok === true;
    const apiKeys = useByok ? await loadEDocByokKeys(deploymentSystemCode(), jRequest.userId) : {};
    const provider = normalizeEDocProvider(selectedModel);
    const creditBalanceBefore = jRequest.userId ? await ensureEDocCredit(deploymentSystemCode(), jRequest.userId) : 0;
    const allowPaidFallback = creditBalanceBefore >= EDOC_TEXT_CREDIT_COST;
    const providerOrder = buildEDocTextProviderOrder(apiKeys).filter(
      (textProviderName) =>
        !EDOC_PAID_TEXT_PROVIDERS.includes(textProviderName) ||
        isEDocByokProvider(apiKeys, textProviderName) ||
        allowPaidFallback,
    );
    // 무료 모델이 가끔 깨진/불완전 JSON을 내므로, 유효한 문서 JSON이 나올 때까지 다음 provider로 폴백한다.
    let gen;
    try {
      gen = await textProvider.generateText({
        systemPrompt,
        userPrompt: `${userPrompt}\n\n${assistantPrompt}`,
        provider,
        providerOrder,
        apiKeys,
        maxTokens: EDOC_MAX_TOKENS,
        validate: isValidGeneratedDoc,
        // 문서 JSON은 한자·일본어 등 다양한 문자를 담을 수 있어 언어 순도 필터를 끈다.
        // (필터가 켜지면 JSON에서 해당 문자를 지워 내용이 훼손됨.)
        skipPurity: true,
      });
    } catch {
      throw new Error("AI가 유효한 문서 구조를 생성하지 못했습니다. 다시 시도해주세요.");
    }
    const chargePaidFallback =
      jRequest.userId &&
      EDOC_PAID_TEXT_PROVIDERS.includes(gen.provider) &&
      !isEDocByokProvider(apiKeys, gen.provider);
    let creditSpend = { ok: true, balance: creditBalanceBefore };

    const docData = normalizeGeneratedDoc(extractDocJson(gen?.text));
    if (!docData) {
      throw new Error("AI가 유효한 문서 구조를 생성하지 못했습니다. 다시 시도해주세요.");
    }

    creditSpend = chargePaidFallback
      ? await spendEDocCreditIfEnough(
          deploymentSystemCode(),
          jRequest.userId,
          EDOC_TEXT_CREDIT_COST,
          "edoc_ai_gen",
          commonFunctions.generateUUID(),
        )
      : { ok: true, balance: creditBalanceBefore };
    if (!creditSpend.ok) {
      throw new Error("AI 문서 생성에 필요한 크레딧이 부족해.");
    }

    jResponse = {
      commandName: jRequest.commandName,
      documentData: docData,
      provider: gen.provider,
      model: gen.model,
      creditBalance: creditSpend.balance,
      creditCost: chargePaidFallback ? EDOC_TEXT_CREDIT_COST : 0,
      error_code: 0,
      error_message: constants.emptyString,
    };
  } catch (e) {
    jResponse = {
      commandName: jRequest.commandName,
      error_code: -1,
      error_message: e.message || String(e),
    };
  }
  return jResponse;
};

export const getAIModelList = async (txnId, jRequest) => {
  let jResponse = {};
  jResponse = {
    commandName: jRequest.commandName,
    error_code: 0,
    error_message: constants.emptyString,
  };

  try {
    jResponse.models = EDOC_MODEL_OPTIONS;
  } catch (e) {
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = `${e}`;
    jResponse.models = [];
  }
  return jResponse;
};

export { executeService };
