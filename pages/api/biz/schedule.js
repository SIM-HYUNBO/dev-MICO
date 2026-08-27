import * as constants from "@/lib/constants";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import * as database from "@/pages/api/biz/database/database";
import * as commonFunctions from "@/lib/commonFunctions";
import { logger } from "@/components/core/server/winston/logger";
import { encrypt as encryptField, decrypt as decryptField } from "@/lib/scheduleEncryption.js";
import { Solar, Lunar } from "lunar-javascript";

export const executeService = async (txnId, jRequest) => {
  switch (jRequest.commandName) {
    case constants.commands.SCHEDULE_CREATE:
      return createSchedule(txnId, jRequest);
    case constants.commands.SCHEDULE_LIST:
      return listSchedules(txnId, jRequest);
    case constants.commands.SCHEDULE_UPDATE:
      return updateSchedule(txnId, jRequest);
    case constants.commands.SCHEDULE_DELETE:
      return deleteSchedule(txnId, jRequest);
    case constants.commands.SCHEDULE_DELETE_OCCURRENCE:
      return deleteOccurrence(txnId, jRequest);
    case constants.commands.SCHEDULE_GET_PARTICIPANTS:
      return getParticipants(txnId, jRequest);
    default:
      return { error_code: "9999", error_message: "지원하지 않는 모듈입니다." };
  }
};

// 반복 일정을 rangeStart~rangeEnd 범위 내 인스턴스로 확장
function expandRecurring(schedule, rangeStart, rangeEnd) {
  if (!schedule.repeat_type) return [schedule];

  const startDate = new Date(schedule.start_time);
  const endDate = new Date(schedule.end_time);
  const duration = endDate - startDate;
  const rangeStartDate = new Date(rangeStart);
  const rangeEndDate = new Date(rangeEnd);
  const untilDate = schedule.repeat_until
    ? new Date(new Date(schedule.repeat_until).toISOString().slice(0, 10) + "T23:59:59.999Z")
    : rangeEndDate;
  const effectiveEnd = untilDate < rangeEndDate ? untilDate : rangeEndDate;

  const isLunarYearly = schedule.repeat_type === "yearly" && schedule.repeat_lunar;

  // 원본 start_time의 음력 월/일 (음력 기준 매년인 경우 한 번만 계산)
  let lunarMonth = null, lunarDay = null;
  if (isLunarYearly) {
    const [y, m, d] = startDate.toISOString().slice(0, 10).split("-").map(Number);
    const l = Solar.fromYmd(y, m, d).getLunar();
    lunarMonth = l.getMonth();
    lunarDay = l.getDay();
  }

  // 연도와 시각 문자열을 받아 음력->양력 Date 반환
  const lunarToDate = (year, timeStr) => {
    const s = Lunar.fromYmd(year, lunarMonth, lunarDay).getSolar();
    return new Date(`${s.getYear()}-${String(s.getMonth()).padStart(2, "0")}-${String(s.getDay()).padStart(2, "0")}T${timeStr}`);
  };

  // 첫 번째 반복 시작점 계산 (rangeStart 이전 것들을 빠르게 건너뜀)
  let current = new Date(startDate);
  if (current < rangeStartDate) {
    switch (schedule.repeat_type) {
      case "daily": {
        const diff = Math.ceil((rangeStartDate - current) / 86400000);
        current.setDate(current.getDate() + diff);
        break;
      }
      case "weekly": {
        const diff = Math.ceil((rangeStartDate - current) / (86400000 * 7));
        current.setDate(current.getDate() + diff * 7);
        break;
      }
      case "monthly": {
        while (current < rangeStartDate) current.setMonth(current.getMonth() + 1);
        break;
      }
      case "yearly": {
        if (isLunarYearly) {
          const timeStr = startDate.toISOString().slice(11);
          let year = startDate.getFullYear();
          while (current < rangeStartDate) {
            year++;
            try { current = lunarToDate(year, timeStr); } catch { current.setFullYear(year); }
          }
        } else {
          while (current < rangeStartDate) current.setFullYear(current.getFullYear() + 1);
        }
        break;
      }
    }
  }

  const exceptions = schedule.exceptions ? JSON.parse(schedule.exceptions) : [];

  const instances = [];
  let safety = 0;
  while (current <= effectiveEnd && safety < 1000) {
    safety++;
    const instanceEnd = new Date(current.getTime() + duration);
    const dateStr = current.toISOString().slice(0, 10);
    if (instanceEnd >= rangeStartDate && !exceptions.includes(dateStr)) {
      instances.push({
        ...schedule,
        start_time: current.toISOString(),
        end_time: instanceEnd.toISOString(),
      });
    }

    let next;
    const timeStr = current.toISOString().slice(11);
    switch (schedule.repeat_type) {
      case "daily":   next = new Date(current); next.setDate(next.getDate() + 1); break;
      case "weekly":  next = new Date(current); next.setDate(next.getDate() + 7); break;
      case "monthly": next = new Date(current); next.setMonth(next.getMonth() + 1); break;
      case "yearly": {
        if (isLunarYearly) {
          const nextYear = current.getFullYear() + 1;
          try { next = lunarToDate(nextYear, timeStr); }
          catch { next = new Date(current); next.setFullYear(nextYear); }
        } else {
          next = new Date(current);
          next.setFullYear(next.getFullYear() + 1);
        }
        break;
      }
      default: next = new Date(current); next.setDate(next.getDate() + 1);
    }
    current = next;
  }
  return instances;
}


const createSchedule = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, loginUserId, title, description, startTime, endTime, isAllDay, color, reminderMinutes, participantIds, repeatType, repeatUntil, scheduleType, repeatLunar } = jRequest;

    if (!title || !startTime || !endTime) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "필수 항목 누락 [title, startTime, endTime]";
      return jResponse;
    }

    const sql = await dynamicSql.getSQL(systemCode, "insert_TB_COR_SCHEDULE", 1);
    const result = await database.executeSQL(sql, [
      systemCode, loginUserId, encryptField(title), encryptField(description) || null,
      startTime, endTime, isAllDay ? "Y" : "N",
      color || "#3b82f6", reminderMinutes ?? null,
      repeatType || null, repeatUntil || null,
      scheduleType || null,
      (repeatType === "yearly" && repeatLunar) ? true : false,
    ]);
    const scheduleId = result.rows[0].schedule_id;

    if (Array.isArray(participantIds) && participantIds.length > 0) {
      const pSql = await dynamicSql.getSQL(systemCode, "insert_TB_COR_SCHEDULE_PARTICIPANT", 1);
      await Promise.all(participantIds.map((uid) => database.executeSQL(pSql, [scheduleId, systemCode, uid])));
    }

    jResponse.scheduleId = scheduleId;
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = commonFunctions.getResourceByLanguage("SUCCESS_FINISHED", constants.resourceType.message, jRequest.languageCode);
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const listSchedules = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, loginUserId, rangeStart, rangeEnd } = jRequest;
    const sql = await dynamicSql.getSQL(systemCode, "select_TB_COR_SCHEDULE", 1);
    const result = await database.executeSQL(sql, [systemCode, loginUserId, rangeStart, rangeEnd]);

    const expanded = result.rows.flatMap((s) => {
      const base = {
        ...s,
        title: decryptField(s.title),
        description: decryptField(s.description),
      };
      return expandRecurring(base, rangeStart, rangeEnd);
    });

    // start_time 순 정렬
    expanded.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    jResponse.schedules = expanded;
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = commonFunctions.getResourceByLanguage("SUCCESS_FINISHED", constants.resourceType.message, jRequest.languageCode);
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const updateSchedule = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, loginUserId, scheduleId, title, description, startTime, endTime, isAllDay, color, reminderMinutes, participantIds, repeatType, repeatUntil, scheduleType, repeatLunar } = jRequest;
    if (!title || !startTime || !endTime) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "필수 항목 누락 [title, startTime, endTime]";
      return jResponse;
    }
    const sql = await dynamicSql.getSQL(systemCode, "update_TB_COR_SCHEDULE", 1);
    const result = await database.executeSQL(sql, [
      systemCode, scheduleId, encryptField(title), encryptField(description) || null,
      startTime, endTime, isAllDay ? "Y" : "N",
      color || "#3b82f6", reminderMinutes ?? null,
      repeatType || null, repeatUntil || null,
      scheduleType || null,
      (repeatType === "yearly" && repeatLunar) ? true : false,
      loginUserId,
    ]);
    if (result.rowCount === 0) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = "일정을 찾을 수 없거나 수정 권한이 없습니다.";
      return jResponse;
    }
    // 참여자 재등록
    const delSql = await dynamicSql.getSQL(systemCode, "delete_TB_COR_SCHEDULE_PARTICIPANT", 1);
    await database.executeSQL(delSql, [scheduleId]);
    if (Array.isArray(participantIds) && participantIds.length > 0) {
      const pSql = await dynamicSql.getSQL(systemCode, "insert_TB_COR_SCHEDULE_PARTICIPANT", 1);
      await Promise.all(participantIds.map((uid) => database.executeSQL(pSql, [scheduleId, systemCode, uid])));
    }
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = commonFunctions.getResourceByLanguage("SUCCESS_FINISHED", constants.resourceType.message, jRequest.languageCode);
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const deleteSchedule = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, loginUserId, scheduleId } = jRequest;
    const sql = await dynamicSql.getSQL(systemCode, "delete_TB_COR_SCHEDULE", 1);
    const result = await database.executeSQL(sql, [systemCode, scheduleId, loginUserId]);
    if (result.rowCount === 0) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = "일정을 찾을 수 없거나 삭제 권한이 없습니다.";
      return jResponse;
    }
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = commonFunctions.getResourceByLanguage("SUCCESS_FINISHED", constants.resourceType.message, jRequest.languageCode);
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const getParticipants = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, scheduleId } = jRequest;
    const sql = await dynamicSql.getSQL(systemCode, "select_TB_COR_SCHEDULE_PARTICIPANT", 1);
    const result = await database.executeSQL(sql, [systemCode, scheduleId]);
    jResponse.participants = result.rows;
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = commonFunctions.getResourceByLanguage("SUCCESS_FINISHED", constants.resourceType.message, jRequest.languageCode);
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const deleteOccurrence = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, loginUserId, scheduleId, occurrenceDate } = jRequest;
    if (!occurrenceDate) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "occurrenceDate 누락";
      return jResponse;
    }

    const getSql = await dynamicSql.getSQL(systemCode, "select_TB_COR_SCHEDULE", 2);
    const getResult = await database.executeSQL(getSql, [systemCode, scheduleId]);
    if (getResult.rows.length === 0) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = "일정을 찾을 수 없습니다.";
      return jResponse;
    }

    const existing = getResult.rows[0];
    const exceptions = existing.exceptions ? JSON.parse(existing.exceptions) : [];
    if (!exceptions.includes(occurrenceDate)) exceptions.push(occurrenceDate);

    const sql = await dynamicSql.getSQL(systemCode, "update_TB_COR_SCHEDULE_EXCEPTION", 1);
    await database.executeSQL(sql, [systemCode, scheduleId, JSON.stringify(exceptions), loginUserId]);

    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = commonFunctions.getResourceByLanguage("SUCCESS_FINISHED", constants.resourceType.message, jRequest.languageCode);
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};
