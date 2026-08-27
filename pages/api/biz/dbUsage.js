import { deploymentSystemCode } from "@/lib/tenantResolver";
import * as constants from "@/lib/constants";
import { SCHEMA } from "@/lib/dbSchema";
import * as commonFunctions from "@/lib/commonFunctions";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import { runService } from "@/lib/serviceRunner";
import { verifySession } from "@/lib/serverSession";
import { logger } from "@/components/core/server/winston/logger";

const SCHEMA_NAME = SCHEMA;

// 이력은 정책 하나당 하루 1행씩 쌓인다. 건수로 자르면 정책이 늘어날수록 조회 기간이
// 짧아지고 일부 테이블은 아예 안 보이므로, 기간으로 자르고 상한만 넉넉히 둔다.
const HISTORY_DAYS = 7;
const HISTORY_MAX_ROWS = 500;
// 백업은 하루 몇 건이므로 7일치를 다 보여줘도 목록이 짧다.
// 행 보관은 보존정책(tb_cor_db_backup_hist, 30일)이 맡는다.
const BACKUP_HISTORY_DAYS = 7;
const BACKUP_HISTORY_MAX_ROWS = 200;

const quoteIdent = (name) => `"${String(name).replace(/"/g, `""`)}"`;
const TABLE_DESCRIPTION_FALLBACKS = {
  "tb_aic_youtube_request": "YouTube publishing request queue and processing state",
  "tb_cor_provider_ai_key": "User-owned AI provider API key metadata",
  "tb_aic_credit": "AI content credit balance by user",
  "tb_aic_credit_ledger": "AI content credit charge and usage ledger",
  "tb_aic_image_job": "AI image generation job queue and results",
  "tb_aic_episode_purchase": "Paid AI content episode purchase records",
  "tb_aic_reaction": "AI content likes, reactions, and reaction status",
  "tb_aic_character": "AI content character profiles and settings",
  "tb_aic_sponsor": "AI content sponsorship and support records",
  "tb_aic_subscription": "AI content subscription records",
  "tb_aic_category": "AI content category master data",
  "tb_aic_preset": "AI content generation preset definitions",
  "tb_aic_space": "AI content workspace or story space master data",
  "tb_aic_episode": "AI content episode records",
  "tb_aic_draft": "AI content draft and generation work-in-progress data",
  "tb_aic_comment": "AI content comments and discussion records",
  "tb_aic_quota": "AI content quota limits and consumption state",
  "tb_aic_share": "AI content sharing links and share metadata",
  "tb_aic_wiki_proposal": "AI wiki proposal and review records",
  "tb_aic_video_job": "AI video generation job queue and results",
  "tb_aic_meeting": "AI meeting session master records",
  "tb_aic_meeting_log": "AI meeting messages and event logs",
  "tb_cor_chat_custom_emoji": "Custom chat emoji definitions and image metadata",
  "tb_cor_chat_reaction": "Chat message reaction records",
  "tb_cor_android_tester": "Android tester allowlist and tester metadata",
  "tb_cor_chat_file": "Uploaded chat file metadata",
  "tb_cor_chat_msg": "Chat message body and message metadata",
  "tb_cor_chat_read_receipt": "Chat message read receipt records",
  "tb_cor_chatroom_invite": "Chatroom invitation records",
  "tb_cor_chatroom_invite_token": "Chatroom invite token records",
  "tb_cor_chatroom_member_device_key": "Per-device encrypted chatroom member key records",
  "tb_cor_chatroom_member_key": "Encrypted chatroom member key records",
  "tb_cor_chatroom_mst": "Chatroom master records",
  "tb_cor_chatroom_room_key": "Current encrypted chatroom room key records",
  "tb_cor_chatroom_room_key_history": "Historical encrypted chatroom room key records",
  "tb_cor_chatroom_users": "Chatroom membership records",
  "tb_cor_complaint": "User complaint and support request records",
  "tb_cor_friend_invite": "Friend invitation records",
  "tb_cor_push_subscription": "Web push subscription endpoint records",
  "tb_cor_schedule": "User schedule master records",
  "tb_cor_schedule_participant": "Schedule participant records",
  "tb_cor_sql_info": "Dynamic SQL registry used by backend services",
  "tb_cor_txn_hist": "Backend transaction request and response history",
  "tb_cor_user_activity_log": "User activity audit and usage log records",
  "tb_cor_user_e2ee_device_key": "User device public keys for end-to-end encryption",
  "tb_cor_user_friend": "User friendship relationship records",
  "tb_cor_user_mst": "User master account and profile records",
  "tb_cor_user_param_info": "User preference and parameter records",
  "tb_cor_user_session": "User login session and expiry records",
  "tb_cor_table_retention_policy": "Table retention policy configured by administrators",
  "tb_cor_table_retention_config": "Table retention cleanup schedule and lease configuration",
  "tb_cor_table_retention_run_hist": "Table retention cleanup execution history",
  "tb_cor_credit_mst": "General service credit balance by user",
  "tb_cor_credit_ledger": "General service credit charge and usage ledger",
  "tb_cor_edoc_component": "Reusable document component template records",
  "tb_cor_edoc_document": "Document master and document content records",
  "tb_cor_game_record": "Game play result and score records",
  "tb_cor_game_play_stat": "Game play statistics and aggregate play metrics",
  "tb_cor_seed_state": "Database seed fingerprint state used to skip already-applied seed SQL",
  "tb_kv_note_embedding": "Knowledge vault note embedding vectors and metadata",
  "tb_kv_note_view": "Knowledge vault note view history records",
  "tb_cor_post_info": "Board post master records",
  "tb_cor_post_comment_info": "Board post comment records",
  "tb_stk_ai_report": "AI stock report records",
  "tb_stk_signal_sub": "Stock signal subscription records",
  "tb_stk_signal_log": "Stock signal delivery and processing log records",
  "tb_stk_paper_account": "Stock paper trading account state",
  "tb_stk_paper_position": "Stock paper trading position state",
  "tb_stk_paper_trade": "Stock paper trading execution history",
  "tb_stk_paper_order": "Stock paper trading order records",
  "tb_stk_ai_paper_run": "AI stock paper trading run records",
  "tb_stk_ai_paper_push_sub": "AI paper trading push subscription records",
  "tb_stk_universe": "Stock market universe master records",
  "tb_stk_universe_symbol": "Stock universe symbol membership records",
  "tb_stk_daily_snapshot": "Daily stock market snapshot records",
  "tb_stk_intraday_snapshot": "Intraday stock market snapshot records",
  "tb_stk_cache": "Stock market cache records",
  "tb_stk_watchlist": "User stock watchlist records",
  "tb_stk_provider_log": "Stock data provider request and response logs",
  "tb_stk_screening_rule": "Stock screening rule definitions",
  "tb_stk_screening_result": "Stock screening execution results"
};

const fallbackTableDescription = (tableName) => {
  const key = String(tableName || "").toLowerCase();
  if (TABLE_DESCRIPTION_FALLBACKS[key]) return TABLE_DESCRIPTION_FALLBACKS[key];
  return `Operational data table for ${key.replace(/^tb_/, "").replace(/_/g, " ")}`;
};


const ok = (jRequest, data = {}) => ({
  commandName: jRequest.commandName,
  data,
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

// 관리자 확인 전에 세션부터 본다. 예전에는 요청 본문의 userId 만 믿었기 때문에
// 관리자 ID 문자열만 알면 보존정책을 걸고 삭제를 실행시킬 수 있었다.
const assertAdmin = async (jRequest) => {
  const authed = await verifySession(
    SCHEMA_NAME,
    deploymentSystemCode(),
    jRequest.userId,
    jRequest.sessionToken,
  );
  if (!authed) return false;

  const userSql = await dynamicSql.getSQL(
    deploymentSystemCode(),
    "select_TB_COR_USER_MST",
    1,
  );
  const user = await database.executeSQL(userSql, [
    deploymentSystemCode(),
    jRequest.userId,
  ]);
  const flag = user.rows[0]?.admin_flag;
  return flag === true || String(flag).toUpperCase() === "Y" || String(flag) === "true";
};

const selectDateColumns = async () => {
  const sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_DATE_COLUMN", 1);
  const result = await database.executeSQL(sql, [SCHEMA_NAME]);
  return result.rows.reduce((acc, row) => {
    acc[row.table_name] ||= [];
    acc[row.table_name].push(row.column_name);
    return acc;
  }, {});
};

const selectPolicies = async (systemCode) => {
  try {
    // 관리자에게는 자기 시스템 정책만 보여준다. 상속되는 기본 행은 없다.
    const sql = await dynamicSql.getSQL(systemCode, "select_TB_COR_TABLE_RETENTION_POLICY", 1);
    const result = await database.executeSQL(sql, [systemCode]);
    return result.rows.reduce((acc, row) => {
      acc[row.table_name] = {
        table: row.table_name,
        systemCode: row.system_code,
        dateColumn: row.date_column,
        retentionDays: Number(row.retention_days || 0),
        enabled: Boolean(row.enabled),
        recommendationLevel: row.recommendation_level || "optional",
        recommendationReason: row.recommendation_reason || "",
        lastRunAt: row.last_run_at,
        lastDeletedCount: Number(row.last_deleted_count || 0),
        lastError: row.last_error || "",
      };
      return acc;
    }, {});
  } catch {
    return {};
  }
};

// create_table_retention_policy.sql 이 심는 시스템 기본 정책의 사유는 영어 고정 문자열이라
// 그대로 내보내면 한국어·일본어 화면에도 영어가 나온다. 아는 값이면 라벨 키로 바꿔 준다.
const SYSTEM_REASON_KEYS = {
  "expired authentication sessions": "adminDbPolicyReasonSession",
  "user activity logs": "adminDbPolicyReasonActivityLog",
  "request and response transaction history": "adminDbPolicyReasonTxnHist",
  "cleanup run history": "adminDbPolicyReasonRunHist",
};

// 화면 문구는 서버에서 확정하지 않고 라벨 키로 내려보낸다 — 표시 언어는 클라이언트가 정한다.
// reason 은 관리자가 직접 적어 둔 자유 입력일 때만 그 값을 쓰고, 아니면 reasonKey 로 번역한다.
const policyRecommendation = (policy, dateColumns = []) => {
  if (policy) {
    const level = policy.recommendationLevel || "optional";
    const rawReason = policy.recommendationReason || "";
    const systemReasonKey = SYSTEM_REASON_KEYS[rawReason.trim().toLowerCase()];
    return {
      level,
      labelKey: policy.enabled
        ? "adminDbPolicyLabelAuto"
        : level === "recommended"
          ? "adminDbPolicyLabelRecommended"
          : "adminDbPolicyLabelRegistered",
      reasonKey: systemReasonKey || "adminDbPolicyReasonRegistered",
      reason: systemReasonKey ? "" : rawReason,
      recommendedDays: Number(policy.retentionDays || 0),
      recommendedYears: Math.round((Number(policy.retentionDays || 0) / 365) * 10) / 10,
      dateColumn: policy.dateColumn || dateColumns[0] || "",
    };
  }
  return dateColumns.length
    ? {
        level: "optional",
        labelKey: "adminDbPolicyLabelUnset",
        reasonKey: "adminDbPolicyReasonUnset",
        reason: "",
        recommendedDays: 0,
        recommendedYears: 0,
        dateColumn: dateColumns[0] || "",
      }
    : {
        level: "none",
        labelKey: "adminDbPolicyLabelNotNeeded",
        reasonKey: "adminDbPolicyReasonNotNeeded",
        reason: "",
        recommendedDays: 0,
        recommendedYears: 0,
        dateColumn: "",
      };
};

const selectDbSize = async () => {
  try {
    // 크론(lib/dbCapacityMonitor.js)이 부르는 것과 같은 등록을 쓴다. 예전에는 이쪽만
    // 쿼리를 코드에 들고 있어 같은 값을 두 벌로 조회했다.
    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_DB_SIZE", 1);
    const result = await database.executeSQL(sql, []);
    return Number(result.rows?.[0]?.bytes || 0);
  } catch {
    return 0;
  }
};

const selectTableUsage = async () => {
  const sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_TABLE_USAGE", 1);
  const result = await database.executeSQL(sql, [SCHEMA_NAME]);
  return withExactRowCounts(result.rows);
};

// reltuples 는 ANALYZE 시점의 추정치라 적재 직후엔 0(또는 -1)로 나온다. 용량은 있는데
// 행수가 0으로 보이는 원인이라, 추정치가 작은 테이블은 실제로 세어 정확한 값을 준다.
// 큰 테이블까지 세면 전체 스캔이 되므로 임계값 위는 추정치를 그대로 쓴다.
const EXACT_COUNT_MAX_ROWS = 200000;

const withExactRowCounts = async (rows) => {
  const targets = rows.filter((r) => Number(r.approx_rows || 0) <= EXACT_COUNT_MAX_ROWS);
  if (targets.length === 0) return rows.map((r) => ({ ...r, rows_exact: false }));

  try {
    // 여기만 동적 SQL 로 옮기지 않는다. 세는 대상 테이블이 실행할 때마다 달라져
    // 쿼리 문장 자체가 매번 다르게 조립된다. 테이블명은 식별자라 $1 로 넘길 수
    // 없으므로, 고정 본문 하나로 등록할 방법이 없다.
    const union = targets
      .map(
        (r) =>
          `SELECT '${r.table_name.replace(/'/g, "''")}' AS table_name, count(*)::bigint AS exact_rows ` +
          `FROM ${quoteIdent(SCHEMA_NAME)}.${quoteIdent(r.table_name)}`,
      )
      .join(" UNION ALL ");
    const counted = await database.executeSQL(union, []);
    const exact = new Map(counted.rows.map((r) => [r.table_name, Number(r.exact_rows || 0)]));
    return rows.map((r) =>
      exact.has(r.table_name)
        ? { ...r, approx_rows: exact.get(r.table_name), rows_exact: true }
        : { ...r, rows_exact: false },
    );
  } catch (e) {
    // 정확한 집계에 실패해도 화면은 떠야 한다. 추정치로 되돌린다.
    logger.warn(`[dbUsage] 정확한 행수 집계 실패: ${e.message}`);
    return rows.map((r) => ({ ...r, rows_exact: false }));
  }
};


const normalizeRunAt = (value) => {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "03:30";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "03:30";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const selectRetentionConfig = async (systemCode) => {
  try {
    // 자기 시스템 행만 읽는다. 없으면 아래 기본값으로 표시한다.
    const sql = await dynamicSql.getSQL(systemCode, "select_TB_COR_TABLE_RETENTION_CONFIG", 1);
    const result = await database.executeSQL(sql, [systemCode]);
    const row = result.rows[0];
    return {
      runAt: normalizeRunAt(row?.run_at || "03:30"),
      timezoneOffsetMinutes: Number(row?.timezone_offset_minutes ?? 540),
    };
  } catch {
    return { runAt: "03:30", timezoneOffsetMinutes: 540 };
  }
};

const selectRetentionHistory = async (systemCode) => {
  try {
    const sql = await dynamicSql.getSQL(systemCode, "select_TB_COR_TABLE_RETENTION_RUN_HIST", 1);
    const result = await database.executeSQL(sql, [String(HISTORY_DAYS), systemCode, HISTORY_MAX_ROWS]);
    return result.rows.map((row) => ({
      runId: Number(row.run_id || 0),
      systemCode: row.system_code,
      table: row.table_name,
      dateColumn: row.date_column,
      retentionDays: Number(row.retention_days || 0),
      batchSize: Number(row.batch_size || 0),
      maxDeletePerRun: Number(row.max_delete_per_run || 0),
      deletedCount: Number(row.deleted_count || 0),
      limited: Boolean(row.limited),
      errorMessage: row.error_message || "",
      triggerType: row.trigger_type || "scheduled",
      runStartedAt: row.run_started_at,
      runFinishedAt: row.run_finished_at,
    }));
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------------------
// DB 백업 — 설정 / 이력 / 지금 실행 / 내려받기 / 복원
//
// 백업은 실패해도 서비스에 영향이 없어서 로그에만 남기고 끝났다. 그 결과 "7일 롤링
// 백업이 있다" 고 믿는 채로 하나도 없는 상태가 유지될 수 있었다(2026-07 볼륨 사고).
// 관리자가 이 화면에서 직접 켜고, 시각을 정하고, 결과를 확인하고, 파일을 받고,
// 필요하면 되돌린다.
// ---------------------------------------------------------------------------

const selectBackupConfig = async () => {
  try {
    const { loadBackupConfig, getDbBackupStatus } = await import("@/lib/dbBackupCron");
    const config = await loadBackupConfig(deploymentSystemCode());
    const status = getDbBackupStatus();
    return {
      enabled: config.enabled,
      runAt: config.runAt,
      intervalHours: config.intervalHours,
      timezoneOffsetMinutes: config.timezoneOffsetMinutes,
      source: config.source,
      state: status.state,
      reason: status.reason,
      nextRunAt: status.nextRunAt || null,
      lastSuccessAt: status.lastSuccessAt || null,
      lastKey: status.lastKey || null,
      method: status.method || null,
    };
  } catch {
    return null;
  }
};

const selectBackupHistory = async (systemCode) => {
  try {
    const sql = await dynamicSql.getSQL(systemCode, "select_TB_COR_DB_BACKUP_HIST", 1);
    const result = await database.executeSQL(sql, [systemCode, BACKUP_HISTORY_MAX_ROWS]);
    return result.rows.map((row) => ({
      backupId: Number(row.backup_id),
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      result: row.result,
      method: row.method,
      objectKey: row.object_key,
      sizeBytes: Number(row.size_bytes || 0),
      tableCount: row.table_count === null ? null : Number(row.table_count),
      rowCount: row.row_count === null ? null : Number(row.row_count),
      errorMessage: row.error_message || "",
      triggeredBy: row.triggered_by || "",
    }));
  } catch {
    // 아직 테이블/동적 SQL 이 안 깔린 배포에서도 화면 전체가 죽지 않게 한다.
    return [];
  }
};

const saveBackupConfig = async (txnId, jRequest) => {
  if (!(await assertAdmin(jRequest))) return noPermission(jRequest);

  const enabled = Boolean(jRequest.enabled);
  const runAt = normalizeRunAt(jRequest.runAt || "04:00");
  const intervalHours = Math.min(24, Math.max(1, Number(jRequest.intervalHours) || 24));
  const timezoneOffsetMinutes = Math.max(
    -14 * 60,
    Math.min(14 * 60, Number(jRequest.timezoneOffsetMinutes ?? 540)),
  );

  const sql = await dynamicSql.getSQL(
    deploymentSystemCode(),
    "update_TB_COR_DB_BACKUP_CONFIG",
    1,
  );
  await database.executeSQL(sql, [
    deploymentSystemCode(), enabled, runAt, intervalHours, timezoneOffsetMinutes,
    jRequest.userId || "admin",
  ]);

  // 저장하면 다음 회차부터 바로 반영된다 — 재배포를 기다리지 않는다.
  let rescheduled = false;
  try {
    const { requestDbBackupReschedule } = await import("@/lib/dbBackupCron");
    rescheduled = requestDbBackupReschedule();
  } catch {
    rescheduled = false;
  }

  return ok(jRequest, { enabled, runAt, intervalHours, timezoneOffsetMinutes, rescheduled });
};

const runBackupNow = async (txnId, jRequest) => {
  if (!(await assertAdmin(jRequest))) return noPermission(jRequest);

  try {
    const { runDbBackupOnce } = await import("@/lib/dbBackupCron");
    // 사람이 눌러 기다리는 실행이라 락을 잡지 않는다 — "다른 인스턴스가 잡고 있다"고
    // 조용히 건너뛰면 눌러도 아무 일도 안 일어난 것처럼 보인다.
    const result = await runDbBackupOnce({ triggeredBy: jRequest.userId || "admin", useLock: false });
    return ok(jRequest, result);
  } catch (e) {
    return {
      commandName: jRequest.commandName,
      error_code: constants.errorCode.ServerValidationError,
      error_message: e?.message || "Backup failed.",
    };
  }
};

// 내려받기는 짧게 유효한 서명 URL 로 준다. 백업 파일은 테넌트 데이터 전부이므로
// 공개 URL 로 두지 않는다.
const backupDownloadUrl = async (txnId, jRequest) => {
  if (!(await assertAdmin(jRequest))) return noPermission(jRequest);

  const objectKey = String(jRequest.objectKey || "").trim();
  if (!objectKey) {
    return {
      commandName: jRequest.commandName,
      error_code: constants.errorCode.ServerValidationError,
      error_message: "Backup file key is required.",
    };
  }
  // 이력에 있는 키만 내려준다. 임의 키를 받으면 버킷의 다른 파일까지 꺼낼 수 있다.
  const history = await selectBackupHistory(deploymentSystemCode());
  if (!history.some((h) => h.objectKey === objectKey)) {
    return {
      commandName: jRequest.commandName,
      error_code: constants.errorCode.ServerValidationError,
      error_message: "The backup file is not in this system's backup history.",
    };
  }

  try {
    const { getPresignedUrl, SIGN_WINDOW_SECONDS } = await import("@/lib/r2Storage");
    const url = await getPresignedUrl(objectKey);
    return ok(jRequest, { url, objectKey, expiresInSeconds: SIGN_WINDOW_SECONDS });
  } catch (e) {
    return {
      commandName: jRequest.commandName,
      error_code: constants.errorCode.ServerValidationError,
      error_message: e?.message || "Failed to create a download link.",
    };
  }
};

// 복원은 이 테넌트만 그 시점으로 되돌린다. 백업 이후에 쌓인 데이터는 사라지므로
// 화면에서 확인 절차를 거치고, 서버에서도 확인 문구를 다시 받는다.
const restoreBackup = async (txnId, jRequest) => {
  if (!(await assertAdmin(jRequest))) return noPermission(jRequest);

  const objectKey = String(jRequest.objectKey || "").trim();
  const dryRun = jRequest.dryRun === true;
  if (!objectKey) {
    return {
      commandName: jRequest.commandName,
      error_code: constants.errorCode.ServerValidationError,
      error_message: "Backup file key is required.",
    };
  }
  const history = await selectBackupHistory(deploymentSystemCode());
  const entry = history.find((h) => h.objectKey === objectKey && h.result === "OK");
  if (!entry) {
    return {
      commandName: jRequest.commandName,
      error_code: constants.errorCode.ServerValidationError,
      error_message: "Only a successful backup in this system's history can be restored.",
    };
  }
  // 실제 반영은 확인 문구를 받았을 때만. 잘못 눌러 데이터가 사라지는 일을 막는다.
  if (!dryRun && String(jRequest.confirm || "") !== objectKey) {
    return {
      commandName: jRequest.commandName,
      error_code: constants.errorCode.ServerValidationError,
      error_message: "Restore confirmation does not match the backup file.",
    };
  }

  try {
    const { getObjectBuffer } = await import("@/lib/r2Storage");
    const { restoreTenantFromBackup } = await import("@/lib/dbBackupCron");
    const buffer = await getObjectBuffer(objectKey);
    const result = await restoreTenantFromBackup(buffer, deploymentSystemCode(), { dryRun });
    logger.info(`[dbBackup] 복원 ${dryRun ? "점검" : "실행"} — ${objectKey} by ${jRequest.userId}`);
    return ok(jRequest, { ...result, objectKey, dryRun });
  } catch (e) {
    return {
      commandName: jRequest.commandName,
      error_code: constants.errorCode.ServerValidationError,
      error_message: e?.message || "Restore failed.",
    };
  }
};

const selectUsage = async (txnId, jRequest) => {
  if (!(await assertAdmin(jRequest))) return noPermission(jRequest);

  const [
    usageRows, dateColumns, policies, dbSizeBytes, retentionConfig, retentionHistory,
    backupConfig, backupHistory,
  ] = await Promise.all([
    selectTableUsage(),
    selectDateColumns(),
    selectPolicies(deploymentSystemCode()),
    selectDbSize(),
    selectRetentionConfig(deploymentSystemCode()),
    selectRetentionHistory(deploymentSystemCode()),
    selectBackupConfig(),
    selectBackupHistory(deploymentSystemCode()),
  ]);

  const tables = usageRows.map((r) => {
    const table = r.table_name;
    const tableDateColumns = dateColumns[table] || [];
    return {
      table,
      description: r.table_description || fallbackTableDescription(table),
      bytes: Number(r.total_bytes || 0),
      size: r.total_size,
      rows: Number(r.approx_rows || 0),
      rowsExact: r.rows_exact === true,
      dateColumns: tableDateColumns,
      retentionPolicy: policies[table] || null,
      retentionRecommendation: policyRecommendation(policies[table], tableDateColumns),
    };
  });

  return ok(jRequest, {
    tables,
    totalBytes: tables.reduce((sum, t) => sum + t.bytes, 0),
    dbSizeBytes,
    capacityBytes: Number(process.env.DB_CAPACITY_BYTES) || 0,
    alertPercent: Math.min(99, Math.max(1, Number(process.env.DB_ALERT_PERCENT) || 80)),
    retentionConfig,
    retentionHistory,
    retentionHistoryDays: HISTORY_DAYS,
    backupConfig,
    backupHistory,
    backupHistoryDays: BACKUP_HISTORY_DAYS,
  });
};

const saveRetentionConfig = async (txnId, jRequest) => {
  if (!(await assertAdmin(jRequest))) return noPermission(jRequest);

  const runAt = normalizeRunAt(jRequest.runAt || "03:30");
  const timezoneOffsetMinutes = Math.max(
    -14 * 60,
    Math.min(14 * 60, Number(jRequest.timezoneOffsetMinutes ?? 540)),
  );

  // 저장은 언제나 자기 시스템 행이다. 퍼지 락도 이 행에 걸리므로,
  // 한 테넌트의 퍼지가 다른 테넌트를 막지 않는다.
  const saveConfigSql = await dynamicSql.getSQL(deploymentSystemCode(), "upsert_TB_COR_TABLE_RETENTION_CONFIG", 1);
  await database.executeSQL(saveConfigSql, [
    deploymentSystemCode(), runAt, timezoneOffsetMinutes, jRequest.userId || "admin",
  ]);

  const { requestTableRetentionReschedule } = await import("@/lib/tableRetentionCron");
  return ok(jRequest, { runAt, timezoneOffsetMinutes, rescheduled: requestTableRetentionReschedule() });
};

const saveRetentionPolicy = async (txnId, jRequest) => {
  if (!(await assertAdmin(jRequest))) return noPermission(jRequest);

  const tableName = String(jRequest.tableName || "").trim();
  const dateColumn = String(jRequest.dateColumn || "").trim();
  const retentionDays = Number(jRequest.retentionDays || 0);
  const enabled = Boolean(jRequest.enabled);

  if (!tableName || !dateColumn || !Number.isInteger(retentionDays) || retentionDays < 1) {
    return {
      commandName: jRequest.commandName,
      error_code: constants.errorCode.ServerValidationError,
      error_message: "Invalid retention policy.",
    };
  }

  const columnCheckSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_DATE_COLUMN", 2);
  const columnCheck = await database.executeSQL(columnCheckSql, [SCHEMA_NAME, tableName, dateColumn]);
  if (columnCheck.rowCount === 0) {
    return {
      commandName: jRequest.commandName,
      error_code: constants.errorCode.ServerValidationError,
      error_message: "The selected table/date column does not exist.",
    };
  }

  // 퍼지는 SYSTEM_CODE 로 좁혀서 지운다. 그 컬럼이 없는 테이블을 켜면 한 번 돌 때
  // 전 테넌트 데이터가 같이 날아가므로 애초에 켜지 못하게 막는다.
  if (enabled) {
    const tenantCheckSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_SYSTEM_CODE_COLUMN", 1);
    const tenantCheck = await database.executeSQL(tenantCheckSql, [SCHEMA_NAME, tableName]);
    if (tenantCheck.rowCount === 0) {
      return {
        commandName: jRequest.commandName,
        error_code: constants.errorCode.ServerValidationError,
        error_message: `The table "${tableName}" has no SYSTEM_CODE column, so it cannot be purged per system.`,
      };
    }
  }

  // 저장은 언제나 자기 시스템 행이다.
  // 이렇게 해야 한 테넌트의 설정이 다른 테넌트 데이터를 지우지 않는다.
  const savePolicySql = await dynamicSql.getSQL(deploymentSystemCode(), "upsert_TB_COR_TABLE_RETENTION_POLICY", 1);
  await database.executeSQL(savePolicySql, [
    deploymentSystemCode(), tableName, dateColumn, retentionDays, enabled, jRequest.userId || "admin",
  ]);

  let indexWarning = "";
  try {
    const { ensureRetentionIndex } = await import("@/lib/tableRetentionCleanup");
    await ensureRetentionIndex(dynamicSql.getSQL, database.executeSQL, tableName, dateColumn);
  } catch (e) {
    indexWarning = e.message || String(e);
  }

  return ok(jRequest, { saved: true, indexWarning });
};

const runRetentionCleanup = async (txnId, jRequest) => {
  if (!(await assertAdmin(jRequest))) return noPermission(jRequest);

  const { runTableRetentionCleanup } = await import("@/lib/tableRetentionCleanup");
  // 수동 실행은 요청한 관리자의 시스템만 지운다. 전체 테넌트를 도는 것은
  // 스케줄러(서버)뿐이다.
  const result = await runTableRetentionCleanup(dynamicSql.getSQL, database.executeSQL, {
    tableName: jRequest.tableName || null,
    systemCode: deploymentSystemCode() || null,
    triggerType: "manual",
  });
  return ok(jRequest, result);
};

const executeService = (txnId, jRequest) =>
  runService(txnId, jRequest, async () => {
    switch (jRequest.commandName) {
      case constants.commands.ADMIN_DB_USAGE:
        return selectUsage(txnId, jRequest);
      case constants.commands.ADMIN_DB_RETENTION_SAVE:
        return saveRetentionPolicy(txnId, jRequest);
      case constants.commands.ADMIN_DB_RETENTION_RUN:
        return runRetentionCleanup(txnId, jRequest);
      case constants.commands.ADMIN_DB_RETENTION_CONFIG_SAVE:
        return saveRetentionConfig(txnId, jRequest);
      case constants.commands.ADMIN_DB_BACKUP_CONFIG_SAVE:
        return saveBackupConfig(txnId, jRequest);
      case constants.commands.ADMIN_DB_BACKUP_RUN:
        return runBackupNow(txnId, jRequest);
      case constants.commands.ADMIN_DB_BACKUP_DOWNLOAD:
        return backupDownloadUrl(txnId, jRequest);
      case constants.commands.ADMIN_DB_BACKUP_RESTORE:
        return restoreBackup(txnId, jRequest);
      default:
        throw new Error(
          commonFunctions.getResourceByLanguage(
            "SERVER_NOT_SUPPORTED_METHOD",
            constants.resourceType.message,
            jRequest.languageCode,
          ),
        );
    }
  });

export { executeService };
