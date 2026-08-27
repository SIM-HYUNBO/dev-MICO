import { deploymentSystemCode } from "@/lib/tenantResolver";
"use strict";

import { logger } from "@/components/core/server/winston/logger";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import { runService } from "@/lib/serviceRunner";
import { v4 as uuidv4 } from "uuid";
import { sendPush } from "@/lib/webPush";
import { enqueuePushJob, getPushSendConcurrency, mapWithConcurrency } from "@/lib/pushQueue";
import { encrypt, decrypt } from "@/lib/chatEncryption";
import * as chatImageStorage from "@/lib/chatImageStorage";

// DB 조회 행의 message 필드 복호화
const decryptRow = (row) => {
  if (!row) return row;
  const decrypted = { ...row, message: decrypt(row.message) };
  // replyTo에 원문 메시지가 포함된 경우 복호화
  if (decrypted.reply_to) {
    try {
      const rt = typeof decrypted.reply_to === "string" ? JSON.parse(decrypted.reply_to) : decrypted.reply_to;
      if (rt?.message) rt.message = decrypt(rt.message);
      decrypted.reply_to = rt;
    } catch {}
  }
  return decrypted;
};

const attachUserPhoneNumbers = async (systemCode, rows, getUserId) => {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];

  const userIds = [
    ...new Set(
      rows
        .map((row) => getUserId(row))
        .filter(Boolean)
        .map(String),
    ),
  ];
  if (userIds.length === 0) return rows;

  const userSql = await dynamicSql.getSQL(
    systemCode,
    "select_TB_COR_USER_MST",
    4,
  );
  const phoneByUserId = new Map();

  await Promise.all(
    userIds.map(async (targetUserId) => {
      const result = await database.executeSQL(userSql, [systemCode, targetUserId]);
      const user = result.rows?.[0];
      if (user) phoneByUserId.set(targetUserId, user.phone_number || "");
    }),
  );

  return rows.map((row) => {
    const targetUserId = String(getUserId(row) || "");
    const phoneNumber = phoneByUserId.get(targetUserId) || "";
    return {
      ...row,
      phone_number: row.phone_number || phoneNumber,
      phoneNumber: row.phoneNumber || phoneNumber,
    };
  });
};

/* ===============================
 * executeService
 * =============================== */
const executeService = (txnId, jRequest) =>
  runService(txnId, jRequest, async () => {
    switch (jRequest.commandName) {
      case constants.commands.CHATROOM_LIST:
        return getChatRoomList(txnId, jRequest);
      case constants.commands.CHATROOM_USERS:
        return getChatRoomUsers(txnId, jRequest);
      case constants.commands.CHATROOM_CREATE:
        return createChatRoom(txnId, jRequest);
      case constants.commands.CHATROOM_ENTER:
        return enterChatRoom(txnId, jRequest);
      case constants.commands.CHATROOM_LEAVE:
        return leaveChatRoom(txnId, jRequest);
      case constants.commands.CHATROOM_SAVE_MESSAGE:
        return saveChatMessage(txnId, jRequest);
      case constants.commands.CHATROOM_LOAD_HISTORY:
        return loadChatHistory(txnId, jRequest);
      case constants.commands.CHATROOM_TRIM_HISTORY:
        return trimChatHistory(txnId, jRequest);
      case constants.commands.CHATROOM_SEND_PUSH_TO_OFFLINE:
        if (jRequest.asyncDispatch) {
          const queueState = enqueuePushJob(
            `room=${jRequest.roomId || "unknown"} sender=${jRequest.senderId || "unknown"}`,
            () => sendPushToOffline(txnId, { ...jRequest, asyncDispatch: false }),
          );
          return {
            error_code: constants.errorCode.Success,
            error_message: "",
            data: queueState,
          };
        }
        return sendPushToOffline(txnId, jRequest);
      case constants.commands.CHATROOM_INVITE:
        return inviteToChatRoom(txnId, jRequest);
      case constants.commands.CHATROOM_ACCEPT_INVITE:
        return acceptRoomInvite(txnId, jRequest);
      case constants.commands.CHATROOM_REJECT_INVITE:
        return rejectRoomInvite(txnId, jRequest);
      case constants.commands.CHATROOM_GET_PENDING_INVITES:
        return getPendingInvites(txnId, jRequest);
      case constants.commands.CHATROOM_KICK:
        return kickFromChatRoom(txnId, jRequest);
      case constants.commands.CHATROOM_RENAME:
        return renameChatRoom(txnId, jRequest);
      case constants.commands.CHATROOM_SAVE_READ_RECEIPTS:
        return saveReadReceipts(txnId, jRequest);
      case constants.commands.CHATROOM_LOAD_READ_RECEIPTS:
        return loadReadReceipts(txnId, jRequest);
      case constants.commands.CHATROOM_MARK_ALL_READ:
        return markAllRead(txnId, jRequest);
      case constants.commands.CHATROOM_LOAD_MORE_HISTORY:
        return loadMoreHistory(txnId, jRequest);
      case constants.commands.CHATROOM_UPDATE_MESSAGE:
        return updateMessage(txnId, jRequest);
      case constants.commands.CHATROOM_DELETE_MESSAGE:
        return deleteMessage(txnId, jRequest);
      case constants.commands.CHATROOM_CREATE_INVITE_TOKEN:
        return createInviteToken(txnId, jRequest);
      case constants.commands.CHATROOM_GET_INVITE_TOKEN:
        return getInviteToken(txnId, jRequest);
      case constants.commands.CHATROOM_JOIN_BY_INVITE_TOKEN:
        return joinByInviteToken(txnId, jRequest);
      case constants.commands.CHATROOM_SAVE_PUBLIC_KEY:
        return savePublicKey(txnId, jRequest);
      case constants.commands.CHATROOM_GET_PUBLIC_KEY:
        return getPublicKey(txnId, jRequest);
      case constants.commands.CHATROOM_SAVE_DEVICE_PUBLIC_KEY:
        return saveDevicePublicKey(txnId, jRequest);
      case constants.commands.CHATROOM_GET_DEVICE_PUBLIC_KEYS:
        return getDevicePublicKeys(txnId, jRequest);
      case constants.commands.CHATROOM_SET_MEMBER_KEY:
        return setMemberKey(txnId, jRequest);
      case constants.commands.CHATROOM_GET_MEMBER_KEY:
        return getMemberKey(txnId, jRequest);
      case constants.commands.CHATROOM_SET_MEMBER_DEVICE_KEY:
        return setMemberDeviceKey(txnId, jRequest);
      case constants.commands.CHATROOM_GET_MEMBER_DEVICE_KEY:
        return getMemberDeviceKey(txnId, jRequest);
      case constants.commands.CHATROOM_SAVE_ROOM_KEY:
        return saveRoomKey(txnId, jRequest);
      case constants.commands.CHATROOM_GET_ROOM_KEY:
        return getRoomKey(txnId, jRequest);
      case constants.commands.CHATROOM_ADD_REACTION:
        return addReaction(txnId, jRequest);
      case constants.commands.CHATROOM_REMOVE_REACTION:
        return removeReaction(txnId, jRequest);
      case constants.commands.OPENCHAT_LIST:
        return getOpenChatList(txnId, jRequest);
      case constants.commands.OPENCHAT_CREATE:
        return createOpenChat(txnId, jRequest);
      case constants.commands.OPENCHAT_JOIN:
        return joinOpenChat(txnId, jRequest);
      case constants.commands.OPENCHAT_LEAVE:
        return leaveOpenChat(txnId, jRequest);
      case constants.commands.OPENCHAT_KICK:
        return kickFromOpenChat(txnId, jRequest);
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
 * 1. 채팅방 목록 조회
 * =============================== */
const getChatRoomList = async (txnId, jRequest) => {
  let jResponse = {};

  try {
    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_CHATROOM_MST",
      1,
    );

    // 참여 중인 방 + 방별 인원 수 조회
    const select_TB_COR_CHATROOM_MST_01 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.userId,
    ]);

    const rooms = select_TB_COR_CHATROOM_MST_01.rows;

    // 목록 SQL이 인원 수를 포함하지 않는 운영 DB도 있어서, 기존 멤버 조회 SQL로 보강한다.
    try {
      const usersSql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "select_TB_COR_CHATROOM_USERS",
        2,
      );
      await Promise.all(
        rooms.map(async (room) => {
          if (Number(room.member_count || 0) > 0) return;
          const usersResult = await database.executeSQL(usersSql, [
            deploymentSystemCode(),
            room.id,
          ]);
          room.member_count = usersResult.rows.length;
        }),
      );
    } catch {
      // 멤버 수 보강 실패 시 기존 목록 응답은 유지
    }

    // 방별 안읽은 메시지 수 병합 (SQL 미등록 시 무시)
    try {
      const unreadSql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "select_TB_COR_CHAT_UNREAD_COUNT_BY_USER",
        1,
      );
      const unreadResult = await database.executeSQL(unreadSql, [
        deploymentSystemCode(),
        jRequest.userId,
      ]);
      const unreadMap = {};
      for (const row of unreadResult.rows) {
        unreadMap[row.room_id] = Number(row.unread_count || 0);
      }
      for (const room of rooms) {
        room.unread_count = unreadMap[room.id] || 0;
        room.unreadCount = room.unread_count;
      }
    } catch {
      // 동적 SQL 미등록 시 unread_count 없이 진행
    }

    // is_secret 병합 (SQL 미등록 시 무시)
    try {
      const secretSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_CHATROOM_MST", 2);
      const secretResult = await database.executeSQL(secretSql, [deploymentSystemCode(), jRequest.userId]);
      const secretMap = {};
      for (const r of secretResult.rows) {
        secretMap[r.id] = r.is_secret || false;
      }
      for (const room of rooms) {
        room.is_secret = secretMap[room.id] || false;
      }
    } catch {}

    jResponse.data = rooms;
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

const getChatRoomUsers = async (txnId, jRequest) => {
  let jResponse = {};

  try {
    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_CHATROOM_USERS",
      2,
    );

    const select_TB_COR_CHATROOM_USERS_02 = await database.executeSQL(
      sql,
      [deploymentSystemCode(), jRequest.roomId],
    );

    jResponse.data = await attachUserPhoneNumbers(
      deploymentSystemCode(),
      select_TB_COR_CHATROOM_USERS_02.rows,
      (row) => row.user_id || row.userId,
    );
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
 * 2. 채팅방 생성 (자동 입장)
 * =============================== */
const createChatRoom = async (txnId, jRequest) => {
  let jResponse = {};
  let sql = null;

  try {
    if (!jRequest.roomName || jRequest.roomName.trim().length === 0) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Required field [roomName]";
      return jResponse;
    }
    if (jRequest.roomName.trim().length > 50) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Field [roomName] must be 50 characters or less";
      return jResponse;
    }

    const roomId = uuidv4();

    // 방 생성 (is_secret=TRUE면 seq=2 사용)
    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "insert_TB_COR_CHATROOM_MST",
      jRequest.isSecret ? 2 : 1,
    );

    const insert_TB_COR_CHATROOM_MST_01 = await database.executeSQL(sql, [
      deploymentSystemCode(),
      roomId,
      jRequest.roomName,
      jRequest.userId,
    ]);

    if (insert_TB_COR_CHATROOM_MST_01.rowCount === 1) {
      // 방 입장
      sql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "insert_TB_COR_CHATROOM_USERS",
        1,
      );

      const insert_TB_COR_CHATROOM_USERS_01 = await database.executeSQL(sql, [
        deploymentSystemCode(),
        roomId,
        jRequest.userId,
      ]);

      if (insert_TB_COR_CHATROOM_USERS_01.rowCount === 1) {
        jResponse.roomId = roomId;
        jResponse.isSecret = !!jRequest.isSecret;
        jResponse.error_code = constants.errorCode.Success;
        jResponse.error_message = commonFunctions.getResourceByLanguage(
          `SUCCESS_FINISHED`,
          constants.resourceType.message,
          jRequest.languageCode,
        );
      } else {
        jResponse.error_code = constants.errorCode.DBCUDError;
        jResponse.error_message = commonFunctions.getResourceByLanguage(
          `FAILED_TO_INSERT_DATA`,
          constants.resourceType.message,
          jRequest.languageCode,
        );
      }
    } else {
      jResponse.error_code = constants.errorCode.DBCUDError;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `FAILED_TO_INSERT_DATA`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 3. 채팅방 입장
 * =============================== */
const enterChatRoom = async (txnId, jRequest) => {
  let jResponse = {};
  let sql = null;

  try {
    const { systemCode, roomId, userId } = jRequest;

    // 입장 — seq=2: MST에서 system_code 자동 조회하여 composite FK 보장
    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "insert_TB_COR_CHATROOM_USERS",
      2,
    );

    const insert_TB_COR_CHATROOM_USERS_01 = await database.executeSQL(sql, [
      roomId,
      userId,
    ]);

    // DIRECT 방에 3명 이상이 되면 GROUP으로 자동 업그레이드
    try {
      const countSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_CHATROOM_MEMBER_COUNT", 1);
      const countResult = await database.executeSQL(countSql, [systemCode, roomId]);
      if (countResult.rows.length > 0) {
        const { member_count, room_type } = countResult.rows[0];
        if (room_type === "DIRECT" && parseInt(member_count, 10) >= 3) {
          const upgradeSql = await dynamicSql.getSQL(deploymentSystemCode(), "update_TB_COR_CHATROOM_MST_ROOM_TYPE", 1);
          await database.executeSQL(upgradeSql, ["GROUP", systemCode, roomId]);
        }
      }
    } catch {}

    if (
      insert_TB_COR_CHATROOM_USERS_01.rowCount === 1 ||
      insert_TB_COR_CHATROOM_USERS_01.rowCount === 0 // 이미 입장한 경우에도 성공으로 간주
    ) {
      jResponse.error_code = constants.errorCode.Success;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `SUCCESS_FINISHED`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
    } else {
      jResponse.error_code = constants.errorCode.DBCUDError;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        `FAILED_TO_INSERT_DATA`,
        constants.resourceType.message,
        jRequest.languageCode,
      );
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 4. 채팅방 나가기
 * =============================== */
const leaveChatRoom = async (txnId, jRequest) => {
  let jResponse = {};

  try {
    const { systemCode, roomId, userId } = jRequest;

    // 사용자 제거
    let sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "delete_TB_COR_CHATROOM_USERS",
      1,
    );

    await database.executeSQL(sql, [systemCode, roomId, userId]);

    // 초대 이력 삭제 — 재초대가 처음과 동일하게 동작하도록 (SQL 미등록 시 무시)
    try {
      const deleteInviteSql = await dynamicSql.getSQL(deploymentSystemCode(), "delete_TB_COR_CHATROOM_INVITE", 1);
      await database.executeSQL(deleteInviteSql, [systemCode, roomId, userId]);
    } catch {}

    // 방에 남은 인원 확인
    const usersSql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_CHATROOM_USERS",
      2,
    );
    const remainingUsers = await database.executeSQL(usersSql, [systemCode, roomId]);

    // 인원수 기반 room_type 자동 조정 (2명 → DIRECT, 3명 이상 → GROUP)
    try {
      const cnt = remainingUsers.rows.length;
      if (cnt >= 2) {
        const upgradeSql = await dynamicSql.getSQL(deploymentSystemCode(), "update_TB_COR_CHATROOM_MST_ROOM_TYPE", 1);
        await database.executeSQL(upgradeSql, [cnt === 2 ? "DIRECT" : "GROUP", systemCode, roomId]);
      }
    } catch {}

    if (remainingUsers.rows.length > 0) {
      // OPEN 방이고 나간 사람이 방장이면 다음 멤버에게 이전
      try {
        const roomSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_OPENCHAT_LIST", 2);
        const roomResult = await database.executeSQL(roomSql, [systemCode, roomId]);
        const room = roomResult.rows?.[0];
        if (room?.room_type === "OPEN" && room?.owner_id === userId) {
          const newOwnerId = remainingUsers.rows[0].user_id;
          const transferSql = await dynamicSql.getSQL(deploymentSystemCode(), "update_TB_COR_OPENCHAT_OWNER", 1);
          await database.executeSQL(transferSql, [systemCode, roomId, newOwnerId]);
        }
      } catch {}
    }

    if (remainingUsers.rows.length === 0) {
      // 빈 방 → 메시지, 읽음 정보, 방 순서대로 삭제
      const deleteMsgSql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "delete_TB_COR_CHAT_MSG",
        3,
      );
      await database.executeSQL(deleteMsgSql, [systemCode, roomId]);

      const deleteReceiptSql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "delete_TB_COR_CHAT_READ_RECEIPT",
        1,
      );
      await database.executeSQL(deleteReceiptSql, [systemCode, roomId]);

      const deleteRoomSql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "delete_TB_COR_CHATROOM_MST",
        1,
      );
      await database.executeSQL(deleteRoomSql, [systemCode, roomId]);
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
 * 초대: 방장이 특정 유저를 방에 추가
 * =============================== */
const inviteToChatRoom = async (txnId, jRequest) => {
  let jResponse = {};

  try {
    const { systemCode, roomId, targetUserId, inviterName, inviterId, roomName } = jRequest;

    if (!targetUserId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Required field [targetUserId]";
      return jResponse;
    }

    // 이미 멤버인지 확인
    const memberSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_CHATROOM_MEMBERSHIP", 1);
    const memberResult = await database.executeSQL(memberSql, [systemCode, roomId, targetUserId]);
    if (memberResult.rowCount > 0) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "이미 채팅방 멤버입니다.";
      return jResponse;
    }

    // invite 테이블에 PENDING 저장 (이미 PENDING이 있으면 UPSERT로 갱신)
    const insertSql = await dynamicSql.getSQL(deploymentSystemCode(), "insert_TB_COR_CHATROOM_INVITE", 1);
    const insertResult = await database.executeSQL(insertSql, [systemCode, roomId, roomName || "", inviterId || "", inviterName || "", targetUserId]);
    const inviteId = insertResult.rows[0]?.invite_id;

    jResponse.inviteId = inviteId;

    // 오프라인 사용자에게 push 알림 (수락 유도)
    try {
      const subSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_PUSH_SUBSCRIPTION", 1);
      const subsResult = await database.executeSQL(subSql, [deploymentSystemCode(), [targetUserId]]);
      if (subsResult.rows.length > 0) {
        const title = inviterName || "Brunner";
        const body = roomName ? `${roomName} 방에 초대되었습니다.` : "채팅방에 초대되었습니다.";
        const pushSoundByUser = await loadPushSoundPreferences(deploymentSystemCode(), [targetUserId]);
        await Promise.allSettled(
          subsResult.rows.map((sub) =>
            sendPush(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              { title, body, url: "/mainPages/chatRoom", badge: 1, inviteId, roomId, roomName, inviterId, inviterName, ...buildPushPayloadSound(pushSoundByUser[targetUserId]) },
            )
          )
        );
      }
    } catch (pushErr) {
      logger.warn(`[invite push] failed: ${pushErr.message}`);
    }

    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = commonFunctions.getResourceByLanguage(`SUCCESS_FINISHED`, constants.resourceType.message, jRequest.languageCode);
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const acceptRoomInvite = async (txnId, jRequest) => {
  let jResponse = {};

  try {
    const { systemCode, inviteId, loginUserId } = jRequest;

    if (!inviteId || !loginUserId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Required field [inviteId, loginUserId]";
      return jResponse;
    }

    const updateSql = await dynamicSql.getSQL(deploymentSystemCode(), "update_TB_COR_CHATROOM_INVITE", 1);
    const updateResult = await database.executeSQL(updateSql, ["ACCEPTED", systemCode, inviteId, loginUserId]);

    if (updateResult.rowCount === 0) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = "초대를 찾을 수 없거나 이미 처리된 초대입니다.";
      return jResponse;
    }

    const { system_code: roomSystemCode, room_id: roomId } = updateResult.rows[0];

    // chatroom_users에 실제 추가 — FK 오류(방 삭제됨)면 초대를 REJECTED 처리, 그 외 오류는 PENDING 롤백
    const memberSql = await dynamicSql.getSQL(deploymentSystemCode(), "insert_TB_COR_CHATROOM_USERS", 1);
    try {
      await database.executeSQL(memberSql, [roomSystemCode, roomId, loginUserId]);
    } catch (insertErr) {
      const isFkViolation = insertErr?.message?.includes("violates foreign key constraint");
      const rollbackStatus = isFkViolation ? "REJECTED" : "PENDING";
      const rollbackSql = await dynamicSql.getSQL(deploymentSystemCode(), "update_TB_COR_CHATROOM_INVITE", 1);
      await database.executeSQL(rollbackSql, [rollbackStatus, systemCode, inviteId, loginUserId]).catch(() => {});
      if (isFkViolation) {
        jResponse.error_code = constants.errorCode.DBValidationError;
        jResponse.error_message = "초대된 채팅방이 더 이상 존재하지 않습니다.";
        return jResponse;
      }
      throw insertErr;
    }

    // DIRECT 방에 3명 이상이 되면 GROUP으로 자동 업그레이드
    try {
      const countSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_CHATROOM_MEMBER_COUNT", 1);
      const countResult = await database.executeSQL(countSql, [roomSystemCode, roomId]);
      if (countResult.rows.length > 0) {
        const { member_count, room_type } = countResult.rows[0];
        if (room_type === "DIRECT" && parseInt(member_count, 10) >= 3) {
          const upgradeSql = await dynamicSql.getSQL(deploymentSystemCode(), "update_TB_COR_CHATROOM_MST_ROOM_TYPE", 1);
          await database.executeSQL(upgradeSql, ["GROUP", roomSystemCode, roomId]);
        }
      }
    } catch {}

    jResponse.roomId = roomId;
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = commonFunctions.getResourceByLanguage(`SUCCESS_FINISHED`, constants.resourceType.message, jRequest.languageCode);
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const rejectRoomInvite = async (txnId, jRequest) => {
  let jResponse = {};

  try {
    const { systemCode, inviteId, loginUserId } = jRequest;

    if (!inviteId || !loginUserId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Required field [inviteId, loginUserId]";
      return jResponse;
    }

    const updateSql = await dynamicSql.getSQL(deploymentSystemCode(), "update_TB_COR_CHATROOM_INVITE", 1);
    const updateResult = await database.executeSQL(updateSql, ["REJECTED", systemCode, inviteId, loginUserId]);

    if (updateResult.rowCount === 0) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = "초대를 찾을 수 없거나 이미 처리된 초대입니다.";
      return jResponse;
    }

    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = commonFunctions.getResourceByLanguage(`SUCCESS_FINISHED`, constants.resourceType.message, jRequest.languageCode);
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const getPendingInvites = async (txnId, jRequest) => {
  let jResponse = {};

  try {
    const { systemCode, loginUserId } = jRequest;

    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_CHATROOM_INVITE", 1);
    const result = await database.executeSQL(sql, [systemCode, loginUserId]);

    jResponse.invites = result.rows;
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = commonFunctions.getResourceByLanguage(`SUCCESS_FINISHED`, constants.resourceType.message, jRequest.languageCode);
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 내보내기: 방장이 특정 유저를 방에서 제거
 * =============================== */
const kickFromChatRoom = async (txnId, jRequest) => {
  let jResponse = {};

  try {
    const { systemCode, roomId, targetUserId } = jRequest;

    if (!targetUserId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Required field [targetUserId]";
      return jResponse;
    }

    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "delete_TB_COR_CHATROOM_USERS",
      1,
    );

    await database.executeSQL(sql, [systemCode, roomId, targetUserId]);

    // 초대 이력 삭제 — 재초대가 처음과 동일하게 동작하도록 (SQL 미등록 시 무시)
    try {
      const deleteInviteSql = await dynamicSql.getSQL(deploymentSystemCode(), "delete_TB_COR_CHATROOM_INVITE", 1);
      await database.executeSQL(deleteInviteSql, [systemCode, roomId, targetUserId]);
    } catch {}

    // 인원수 기반 room_type 자동 조정 (2명 → DIRECT, 3명 이상 → GROUP)
    try {
      const usersSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_CHATROOM_USERS", 2);
      const remaining = await database.executeSQL(usersSql, [systemCode, roomId]);
      const cnt = remaining.rows.length;
      if (cnt >= 2) {
        const upgradeSql = await dynamicSql.getSQL(deploymentSystemCode(), "update_TB_COR_CHATROOM_MST_ROOM_TYPE", 1);
        await database.executeSQL(upgradeSql, [cnt === 2 ? "DIRECT" : "GROUP", systemCode, roomId]);
      }
    } catch {}

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
 * 5. 채팅 메시지 저장
 * =============================== */
const saveChatMessage = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "insert_TB_COR_CHAT_MSG",
      1,
    );
    // 이미지가 data URL 로 오면 바이트는 R2 로 보내고 본문에는 참조만 남긴다.
    // 실패하면 예전처럼 base64 를 그대로 저장한다 — 메시지 전송 자체를 막지 않는다.
    let messageToStore = jRequest.message;
    try {
      const stored = await chatImageStorage.storeMessageImage(jRequest.roomId, jRequest.message);
      if (stored) messageToStore = stored;
    } catch (e) {
      logger.error(`채팅 이미지 R2 저장 실패 — 본문 저장으로 대체: ${e?.message || e}`);
    }

    const encryptedMessage = encrypt(messageToStore);
    const replyToJson = jRequest.replyTo ? JSON.stringify(jRequest.replyTo) : null;
    const result = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.roomId,
      jRequest.chatUserId,
      jRequest.userName,
      encryptedMessage,
      replyToJson,
    ]);
    jResponse.msgId = result.rows?.[0]?.msg_id ?? null;
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 6. 채팅 이력 조회
 * =============================== */
const loadChatHistory = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_CHAT_MSG",
      1,
    );
    const result = await database.executeSQL(sql, [deploymentSystemCode(), jRequest.roomId]);
    jResponse.data = result.rows.reverse().map(decryptRow);
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 7. 채팅 이력 1000건 초과 삭제
 * =============================== */
const trimChatHistory = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "delete_TB_COR_CHAT_MSG",
      1,
    );
    await database.executeSQL(sql, [deploymentSystemCode(), jRequest.roomId]);
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 8. 오프라인 멤버에게 푸시 알림 전송
 * =============================== */
const restoreDirectChatMembersForPush = async (systemCode, roomId, currentMembers) => {
  try {
    const participantSql = await dynamicSql.getSQL(
      systemCode,
      "select_TB_COR_DIRECT_CHAT_PARTICIPANT",
      1,
    );
    const participantResult = await database.executeSQL(participantSql, [
      systemCode,
      roomId,
    ]);
    const participantIds = [
      ...new Set(participantResult.rows.map((row) => row.user_id).filter(Boolean)),
    ];

    if (participantIds.length < 2 || participantIds.length > 2) {
      return currentMembers;
    }

    const currentUserIds = new Set(currentMembers.map((member) => member.user_id));
    const missingUserIds = participantIds.filter((userId) => !currentUserIds.has(userId));
    if (missingUserIds.length === 0) {
      return currentMembers;
    }

    const insertSql = await dynamicSql.getSQL(
      systemCode,
      "insert_TB_COR_CHATROOM_USERS",
      1,
    );

    for (const userId of missingUserIds) {
      await database.executeSQL(insertSql, [systemCode, roomId, userId]);
      currentMembers.push({ user_id: userId });
    }

    logger.info(
      `[push] restored direct chat member(s): roomId=${roomId} users=[${missingUserIds.join(",")}]`,
    );
  } catch (e) {
    logger.warn(`[push] failed to restore direct chat members: ${e.message}`);
  }

  return currentMembers;
};

const loadPushSoundPreferences = async (systemCode, userIds = []) => {
  const sounds = {};
  if (!userIds.length) return sounds;
  try {
    const sql = await dynamicSql.getSQL(systemCode, "select_TB_COR_USER_PARAM_INFO", 1);
    await Promise.allSettled(
      userIds.map(async (userId) => {
        const result = await database.executeSQL(sql, [systemCode, userId]);
        const sound = result.rows?.[0]?.user_params?.pushNotificationSound;
        sounds[userId] = typeof sound === "string" && sound ? sound : "default";
      }),
    );
  } catch (e) {
    logger.warn(`[push] failed to load sound preferences: ${e.message}`);
  }
  return sounds;
};

const buildPushPayloadSound = (soundId) => {
  const sound = typeof soundId === "string" && soundId ? soundId : "default";
  return {
    sound,
    silent: sound === "silent",
  };
};

const sendPushToOffline = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const {
      roomId,
      senderId,
      senderName,
      message,
      onlineUserIds = [],
      readReceiptSnapshot = {},
      totalMessageCount = 0,
    } = jRequest;

    logger.info(`[push] sendPushToOffline: roomId=${roomId} sender=${senderId} online=[${onlineUserIds.join(",")}]`);

    // 채팅방 멤버 조회
    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_CHATROOM_USERS",
      2,
    );
    const membersResult = await database.executeSQL(sql, [
      deploymentSystemCode(),
      roomId,
    ]);
    const allMembers = await restoreDirectChatMembersForPush(
      deploymentSystemCode(),
      roomId,
      membersResult.rows,
    );

    logger.info(`[push] allMembers(${allMembers.length}): [${allMembers.map((m) => m.user_id).join(",")}]`);

    // 온라인(현재 방에 있는) 사용자 제외
    const onlineSet = new Set(onlineUserIds);
    const offlineMembers = allMembers.filter(
      (m) => m.user_id !== senderId && !onlineSet.has(m.user_id),
    );

    logger.info(`[push] offlineMembers(${offlineMembers.length}): [${offlineMembers.map((m) => m.user_id).join(",")}]`);

    if (offlineMembers.length === 0) {
      jResponse.error_code = constants.errorCode.Success;
      jResponse.error_message = "";
      return jResponse;
    }
    const offlineIds = offlineMembers.map((m) => m.user_id);
    const pushSoundByUser = await loadPushSoundPreferences(deploymentSystemCode(), offlineIds);
    const selectSql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_PUSH_SUBSCRIPTION",
      1,
    );
    const subsResult = await database.executeSQL(selectSql, [deploymentSystemCode(), offlineIds]);

    // 사용자별 미읽은 메시지 수 fallback 계산 (인메모리 readReceiptSnapshot 기반)
    const getSnapshotUnreadCount = (userId) => {
      if (!totalMessageCount) return 0;
      let unread = 0;
      for (const readers of Object.values(readReceiptSnapshot)) {
        if (!readers.includes(userId)) unread++;
      }
      return unread;
    };

    // 방 이름 조회 (sender는 반드시 해당 방 멤버)
    let roomName = "";
    try {
      const roomSql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "select_TB_COR_CHATROOM_MST",
        1,
      );
      const roomResult = await database.executeSQL(roomSql, [deploymentSystemCode(), senderId]);
      roomName = roomResult.rows?.find((r) => r.id === roomId)?.name || "";
    } catch (e) {
      logger.warn(`[push] failed to fetch room name: ${e.message}`);
    }

    const rawBody = message?.startsWith("sec:") ? "새 비밀 메시지" : message;
    const msgBody = (rawBody || "").length > 60 ? rawBody.slice(0, 60) + "…" : (rawBody || "");
    const roomUrl = `/mainPages/chatRoom?roomId=${roomId}${roomName ? `&roomName=${encodeURIComponent(roomName)}` : ""}`;

    // 오프라인 사용자별 전체 방 미읽은 합산 (앱 배지용)
    let totalUnreadSql = null;
    try {
      totalUnreadSql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "select_TB_COR_CHAT_UNREAD_COUNT_BY_USER",
        1,
      );
    } catch {
      // SQL 미등록 시 무시
    }

    const getUnreadSummaryForUser = async (userId) => {
      const fallbackRoomUnread = getSnapshotUnreadCount(userId);
      if (!totalUnreadSql) {
        return {
          roomUnread: fallbackRoomUnread,
          totalUnread: fallbackRoomUnread,
        };
      }
      try {
        const res = await database.executeSQL(totalUnreadSql, [deploymentSystemCode(), userId]);
        const roomUnread = res.rows.find((row) => row.room_id === roomId)?.unread_count || 0;
        const totalUnread = res.rows.reduce((sum, row) => sum + (row.unread_count || 0), 0);
        return {
          roomUnread,
          totalUnread,
        };
      } catch {
        return {
          roomUnread: fallbackRoomUnread,
          totalUnread: fallbackRoomUnread,
        };
      }
    };

    // 각 구독에 푸시 발송 (만료된 구독은 DB에서 삭제)
    logger.info(`[push] sending to ${subsResult.rows.length} subscription(s) for room ${roomId}`);
    const expiredEndpoints = [];
    const pushResults = await mapWithConcurrency(
      subsResult.rows,
      getPushSendConcurrency(),
      async (sub) => {
        const { roomUnread: thisRoomUnread, totalUnread: unreadCount } =
          await getUnreadSummaryForUser(sub.user_id);
        const soundPayload = buildPushPayloadSound(pushSoundByUser[sub.user_id]);
        const payload = {
          title: senderName,
          body: thisRoomUnread > 1 ? `${msgBody} (${thisRoomUnread}개의 안 읽은 메시지)` : msgBody,
          url: roomUrl,
          badge: unreadCount,
          roomId: String(roomId),
          forceNotification: true,
          ...soundPayload,
        };
        const result = await sendPush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        if (result.expired) {
          logger.info(`[push] expired subscription for user ${sub.user_id}`);
          expiredEndpoints.push({ userId: sub.user_id, endpoint: sub.endpoint });
        } else {
          logger.info(`[push] sent to user ${sub.user_id} (unread: ${unreadCount})`);
        }
      },
    );
    pushResults.forEach((result, index) => {
      if (result.status === "rejected") {
        const sub = subsResult.rows[index];
        logger.warn(
          `[push] failed to send to user ${sub?.user_id || "unknown"}: ${result.reason?.message || result.reason}`,
        );
      }
    });

    if (expiredEndpoints.length > 0) {
      const deleteSql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "delete_TB_COR_PUSH_SUBSCRIPTION",
        1,
      );
      for (const { userId, endpoint } of expiredEndpoints) {
        await database.executeSQL(deleteSql, [userId, endpoint]);
      }
    }

    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 채팅방 이름 변경 (방 생성자만 가능)
 * =============================== */
const renameChatRoom = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { roomId, roomName, userId, systemCode } = jRequest;

    if (!roomId || !roomName?.trim()) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Required fields [roomId, roomName]";
      return jResponse;
    }
    if (roomName.trim().length > 50) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Field [roomName] must be 50 characters or less";
      return jResponse;
    }

    // 방 생성자 확인
    const selectSql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_CHATROOM_MST",
      1,
    );
    const roomResult = await database.executeSQL(selectSql, [systemCode, userId]);
    const room = roomResult.rows?.find((r) => r.id === roomId);

    if (!room || room.created_by !== userId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "방을 생성한 사람만 이름을 변경할 수 있습니다.";
      return jResponse;
    }

    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "update_TB_COR_CHATROOM_MST",
      1,
    );

    const result = await database.executeSQL(sql, [
      roomName.trim(),
      systemCode,
      roomId,
      userId,
    ]);

    if (result.rowCount === 1) {
      jResponse.error_code = constants.errorCode.Success;
      jResponse.error_message = "";
    } else {
      jResponse.error_code = constants.errorCode.DBCUDError;
      jResponse.error_message = commonFunctions.getResourceByLanguage(
        "FAILED_TO_UPDATE_DATA",
        constants.resourceType.message,
        jRequest.languageCode,
      );
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 읽음 확인 저장 (upsert)
 * { systemCode, roomId, messageIds: number[], userId }
 * =============================== */
const saveReadReceipts = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, roomId, messageIds = [], userId } = jRequest;
    if (!messageIds.length) {
      jResponse.error_code = constants.errorCode.Success;
      return jResponse;
    }
    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "insert_TB_COR_CHAT_READ_RECEIPT",
      1,
    );
    for (const msgId of messageIds) {
      await database.executeSQL(sql, [systemCode, roomId, msgId, userId]);
    }
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 읽음 확인 조회
 * { systemCode, roomId }
 * → data: [{ messageId, userIds }]
 * =============================== */
const loadReadReceipts = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_CHAT_READ_RECEIPT",
      1,
    );
    const result = await database.executeSQL(sql, [deploymentSystemCode(), jRequest.roomId]);
    jResponse.data = result.rows.map((r) => ({
      messageId: Number(r.message_id),
      userIds: r.user_ids || [],
    }));
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 초대 토큰 생성
 * { systemCode, roomId, userId }
 * =============================== */
const createInviteToken = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const token = uuidv4();
    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "insert_TB_COR_CHATROOM_INVITE_TOKEN",
      1,
    );
    await database.executeSQL(sql, [
      deploymentSystemCode(),
      token,
      jRequest.roomId,
      jRequest.userId,
    ]);
    jResponse.token = token;
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 초대 토큰으로 방 정보 조회
 * { systemCode, token }
 * =============================== */
const getInviteToken = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_CHATROOM_INVITE_TOKEN",
      1,
    );
    const result = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.token,
    ]);
    if (!result.rows.length) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "유효하지 않거나 만료된 초대 링크입니다.";
      return jResponse;
    }
    jResponse.data = result.rows[0];
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 초대 토큰으로 채팅방 입장
 * { systemCode, token, userId }
 * =============================== */
const joinByInviteToken = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const tokenSql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_CHATROOM_INVITE_TOKEN",
      1,
    );
    const tokenResult = await database.executeSQL(tokenSql, [
      deploymentSystemCode(),
      jRequest.token,
    ]);
    if (!tokenResult.rows.length) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "유효하지 않거나 만료된 초대 링크입니다.";
      return jResponse;
    }
    const { room_id, room_name } = tokenResult.rows[0];

    // 이미 멤버인지 확인 후 입장
    const enterSql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "insert_TB_COR_CHATROOM_USERS",
      1,
    );
    await database.executeSQL(enterSql, [
      deploymentSystemCode(),
      room_id,
      jRequest.userId,
    ]).catch(() => {});

    jResponse.roomId = room_id;
    jResponse.roomName = room_name;
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 페이지네이션: beforeId 이전 메시지 20개 조회
 * { roomId, beforeId }
 * =============================== */
const loadMoreHistory = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_CHAT_MSG",
      2,
    );
    const result = await database.executeSQL(sql, [
      deploymentSystemCode(),
      jRequest.roomId,
      jRequest.beforeId,
    ]);
    jResponse.data = result.rows.reverse().map(decryptRow);
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 방의 모든 메시지를 현재 사용자 읽음 처리
 * { systemCode, roomId, userId }
 * =============================== */
const markAllRead = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, roomId, userId } = jRequest;
    if (!roomId || !userId) {
      jResponse.error_code = constants.errorCode.Success;
      return jResponse;
    }
    // 내가 보내지 않은 메시지 중 아직 읽지 않은 것을 일괄 읽음 처리
    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "insert_TB_COR_CHAT_READ_RECEIPT_ALL",
      1,
    );
    await database.executeSQL(sql, [systemCode, roomId, userId]);
    try {
      const unreadSql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "select_TB_COR_CHAT_UNREAD_COUNT_BY_USER",
        1,
      );
      const unreadResult = await database.executeSQL(unreadSql, [systemCode, userId]);
      const row = unreadResult.rows?.find((r) => String(r.room_id) === String(roomId));
      jResponse.unread_count = Number(row?.unread_count || 0);
      jResponse.unreadCount = jResponse.unread_count;
    } catch {
      jResponse.unread_count = 0;
      jResponse.unreadCount = 0;
    }
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 메시지 수정
 * { systemCode, roomId, messageId, userId, newMessage }
 * =============================== */
const updateMessage = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, roomId, messageId, userId, newMessage } = jRequest;
    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "update_TB_COR_CHAT_MSG",
      1,
    );
    await database.executeSQL(sql, [encrypt(newMessage), systemCode, roomId, messageId, userId]);
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 메시지 삭제 (soft delete)
 * { systemCode, roomId, messageId, userId }
 * =============================== */
const deleteMessage = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, roomId, messageId, userId } = jRequest;
    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "delete_TB_COR_CHAT_MSG",
      2,
    );
    await database.executeSQL(sql, [systemCode, roomId, messageId, userId]);
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 공개키 저장 (E2EE)
 * { systemCode, userId, publicKey }
 * =============================== */
const savePublicKey = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, userId, publicKey } = jRequest;
    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "upsert_TB_COR_USER_MST_pubkey", 1);
    await database.executeSQL(sql, [publicKey, systemCode, userId]);
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 공개키 조회 (E2EE)
 * { systemCode, targetUserId }
 * =============================== */
const getPublicKey = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, targetUserId } = jRequest;
    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_USER_MST_pubkey", 1);
    const result = await database.executeSQL(sql, [systemCode, targetUserId]);
    jResponse.publicKey = result.rows[0]?.public_key || null;
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const saveDevicePublicKey = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, userId, deviceId, publicKey } = jRequest;
    if (!deviceId || !publicKey) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Required fields [deviceId, publicKey]";
      return jResponse;
    }
    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "upsert_TB_COR_USER_E2EE_DEVICE_KEY", 1);
    await database.executeSQL(sql, [systemCode, userId, deviceId, publicKey]);
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const getDevicePublicKeys = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, targetUserId, targetDeviceId = null } = jRequest;
    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_USER_E2EE_DEVICE_KEY", 1);
    const result = await database.executeSQL(sql, [systemCode, targetUserId, targetDeviceId]);
    let publicKeys = (result.rows || [])
      .filter((row) => row.public_key)
      .map((row) => ({
        deviceId: row.device_id,
        publicKey: row.public_key,
      }));

    if (publicKeys.length === 0 && !targetDeviceId) {
      const legacySql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_USER_MST_pubkey", 1);
      const legacyResult = await database.executeSQL(legacySql, [systemCode, targetUserId]);
      const legacyKey = legacyResult.rows[0]?.public_key;
      if (legacyKey) {
        publicKeys = [{ deviceId: "default", publicKey: legacyKey }];
      }
    }

    jResponse.publicKeys = publicKeys;
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const setMemberKey = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, roomId, targetUserId, encryptedKey, keyProviderId } = jRequest;
    const userId = targetUserId || jRequest.userId;
    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "upsert_TB_COR_CHATROOM_MEMBER_KEY", 1);
    await database.executeSQL(sql, [systemCode, roomId, userId, encryptedKey, keyProviderId]);
    jResponse.error_code = constants.errorCode.Success;
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const getMemberKey = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, roomId, userId } = jRequest;
    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_CHATROOM_MEMBER_KEY", 1);
    const result = await database.executeSQL(sql, [systemCode, roomId, userId]);
    if (result.rowCount > 0) {
      jResponse.encryptedKey = result.rows[0].encrypted_key;
      jResponse.keyProviderId = result.rows[0].key_provider_id;
    }
    jResponse.error_code = constants.errorCode.Success;
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const setMemberDeviceKey = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const {
      systemCode,
      roomId,
      targetUserId,
      deviceId,
      encryptedKey,
      keyProviderId,
      keyProviderDeviceId,
    } = jRequest;
    const userId = targetUserId || jRequest.userId;
    if (!deviceId || !encryptedKey) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Required fields [deviceId, encryptedKey]";
      return jResponse;
    }
    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "upsert_TB_COR_CHATROOM_MEMBER_DEVICE_KEY", 1);
    await database.executeSQL(sql, [
      systemCode,
      roomId,
      userId,
      deviceId,
      encryptedKey,
      keyProviderId,
      keyProviderDeviceId || null,
    ]);
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const getMemberDeviceKey = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, roomId, userId, deviceId } = jRequest;
    if (!deviceId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Required field [deviceId]";
      return jResponse;
    }
    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_CHATROOM_MEMBER_DEVICE_KEY", 1);
    const result = await database.executeSQL(sql, [systemCode, roomId, userId, deviceId]);
    if (result.rowCount > 0) {
      jResponse.encryptedKey = result.rows[0].encrypted_key;
      jResponse.keyProviderId = result.rows[0].key_provider_id;
      jResponse.keyProviderDeviceId = result.rows[0].key_provider_device_id;
    }
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const saveRoomKey = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, roomId, roomKeyB64, userId } = jRequest;
    if (!roomId || !roomKeyB64) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Required fields [roomId, roomKeyB64]";
      return jResponse;
    }
    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "upsert_TB_COR_CHATROOM_ROOM_KEY", 1);
    await database.executeSQL(sql, [systemCode, roomId, roomKeyB64]);
    const historySql = await dynamicSql.getSQL(deploymentSystemCode(), "upsert_TB_COR_CHATROOM_ROOM_KEY_HISTORY", 1);
    await database.executeSQL(historySql, [systemCode, roomId, roomKeyB64]);
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const getRoomKey = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, roomId, userId } = jRequest;
    if (!roomId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Required field [roomId]";
      return jResponse;
    }
    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_CHATROOM_ROOM_KEY", 1);
    const result = await database.executeSQL(sql, [systemCode, roomId, userId]);
    const roomKeyB64List = [];
    if (result.rowCount > 0) {
      jResponse.roomKeyB64 = result.rows[0].room_key_b64;
      roomKeyB64List.push(result.rows[0].room_key_b64);
    }
    try {
      const historySql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_CHATROOM_ROOM_KEY_HISTORY", 1);
      const historyResult = await database.executeSQL(historySql, [systemCode, roomId, userId]);
      for (const row of historyResult.rows || []) {
        if (row.room_key_b64 && !roomKeyB64List.includes(row.room_key_b64)) {
          roomKeyB64List.push(row.room_key_b64);
        }
      }
    } catch {}
    jResponse.roomKeyB64List = roomKeyB64List;
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 리액션 추가
 * { systemCode, roomId, messageId, userId, emoji }
 * =============================== */
const addReaction = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, roomId, messageId, userId, emoji } = jRequest;
    if (!roomId || !messageId || !userId || !emoji) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "roomId, messageId, userId, emoji required";
      return jResponse;
    }
    const memberSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_CHATROOM_MEMBERSHIP", 1);
    const memberResult = await database.executeSQL(memberSql, [systemCode, roomId, userId]);
    if (memberResult.rowCount === 0) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = "Not a member";
      return jResponse;
    }
    const msgSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_CHAT_MSG_BY_ROOM", 1);
    const msgResult = await database.executeSQL(msgSql, [systemCode, roomId, messageId]);
    if (msgResult.rowCount === 0) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = "Message not in room";
      return jResponse;
    }
    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "upsert_TB_COR_CHAT_REACTION", 1);
    await database.executeSQL(sql, [systemCode, messageId, userId, emoji]);
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 리액션 삭제
 * { systemCode, roomId, messageId, userId, emoji }
 * =============================== */
const removeReaction = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, roomId, messageId, userId, emoji } = jRequest;
    if (!roomId || !messageId || !userId || !emoji) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "roomId, messageId, userId, emoji required";
      return jResponse;
    }
    const memberSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_CHATROOM_MEMBERSHIP", 1);
    const memberResult = await database.executeSQL(memberSql, [systemCode, roomId, userId]);
    if (memberResult.rowCount === 0) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = "Not a member";
      return jResponse;
    }
    const msgSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_CHAT_MSG_BY_ROOM", 1);
    const msgResult = await database.executeSQL(msgSql, [systemCode, roomId, messageId]);
    if (msgResult.rowCount === 0) {
      jResponse.error_code = constants.errorCode.DBValidationError;
      jResponse.error_message = "Message not in room";
      return jResponse;
    }
    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "delete_TB_COR_CHAT_REACTION", 1);
    await database.executeSQL(sql, [systemCode, messageId, userId, emoji]);
    jResponse.error_code = constants.errorCode.Success;
    jResponse.error_message = "";
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* ===============================
 * 오픈채팅 목록 조회
 * =============================== */
const getOpenChatList = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, category = "ALL" } = jRequest;
    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_OPENCHAT_LIST", 1);
    const result = await database.executeSQL(sql, [systemCode, category]);
    jResponse.data = result.rows;
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

/* ===============================
 * 오픈채팅 방 생성
 * =============================== */
const createOpenChat = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, userId, roomName, category, description = "", maxMembers = 100 } = jRequest;
    if (!roomName?.trim()) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Required field [roomName]";
      return jResponse;
    }
    if (!category) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Required field [category]";
      return jResponse;
    }
    const roomId = uuidv4();
    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "insert_TB_COR_OPENCHAT_MST", 1);
    await database.executeSQL(sql, [systemCode, roomId, roomName.trim(), userId, category, description, maxMembers]);

    // 개설자 자동 입장
    const joinSql = await dynamicSql.getSQL(deploymentSystemCode(), "insert_TB_COR_CHATROOM_USERS", 2);
    await database.executeSQL(joinSql, [roomId, userId]);

    jResponse.roomId = roomId;
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

/* ===============================
 * 오픈채팅 입장 (최대 인원 체크)
 * =============================== */
const joinOpenChat = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, roomId, userId } = jRequest;
    const roomSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_OPENCHAT_LIST", 2);
    const roomResult = await database.executeSQL(roomSql, [systemCode, roomId]);
    const room = roomResult.rows?.[0];

    if (!room) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Room not found";
      return jResponse;
    }
    if (Number(room.member_count) >= Number(room.max_members)) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = commonFunctions.getResourceByLanguage("openChatFull", constants.resourceType.label, jRequest.languageCode) || "Room is full";
      return jResponse;
    }

    const joinSql = await dynamicSql.getSQL(deploymentSystemCode(), "insert_TB_COR_CHATROOM_USERS", 2);
    await database.executeSQL(joinSql, [roomId, userId]);

    jResponse.roomId = roomId;
    jResponse.roomName = room.name;
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

/* ===============================
 * 오픈채팅 퇴장 (방장 이전 + 빈 방 삭제)
 * =============================== */
const leaveOpenChat = async (txnId, jRequest) => {
  return leaveChatRoom(txnId, jRequest);
};

/* ===============================
 * 오픈채팅 강퇴 (방장만 가능)
 * =============================== */
const kickFromOpenChat = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, roomId, userId, targetUserId } = jRequest;

    // 방장 검증
    const roomSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_OPENCHAT_LIST", 2);
    const roomResult = await database.executeSQL(roomSql, [systemCode, roomId]);
    const room = roomResult.rows?.[0];

    if (!room || room.owner_id !== userId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Only the room owner can kick members";
      return jResponse;
    }

    const kickSql = await dynamicSql.getSQL(deploymentSystemCode(), "delete_TB_COR_CHATROOM_USERS", 1);
    await database.executeSQL(kickSql, [systemCode, roomId, targetUserId]);

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

export { executeService };
