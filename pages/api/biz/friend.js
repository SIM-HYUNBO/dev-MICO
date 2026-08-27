import { deploymentSystemCode } from "@/lib/tenantResolver";
import { logger } from "@/components/core/server/winston/logger";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import { runService } from "@/lib/serviceRunner";
import { sendPush } from "@/lib/webPush";

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
      friend_phone_number: row.friend_phone_number || phoneNumber,
      friendPhoneNumber: row.friendPhoneNumber || phoneNumber,
    };
  });
};

const executeService = (txnId, jRequest) =>
  runService(txnId, jRequest, async () => {
    if (!deploymentSystemCode() || !jRequest.userId) {
      return {
        error_code: constants.errorCode.ServerValidationError,
        error_message: "Invalid parameter",
      };
    }

    switch (jRequest.commandName) {
      case constants.commands.FRIEND_ADD_FRIEND:
        return addUserFriend(txnId, jRequest);
      case constants.commands.FRIEND_BLOCK_FRIEND:
        return blockUserFriend(txnId, jRequest);
      case constants.commands.FRIEND_CHECK_CHATROOM_WITH_FRIEND:
        return checkChatRoomWithFriend(txnId, jRequest);
      case constants.commands.FRIEND_LIST_BY_USER:
        return getFriendListByUser(txnId, jRequest);
      case constants.commands.FRIEND_SEARCH_USER_BY_KEYWORD:
        return searchUsersByKeyword(txnId, jRequest);
      case constants.commands.FRIEND_UNBLOCK_FRIEND:
        return unblockUserFriend(txnId, jRequest);
      case constants.commands.FRIEND_DELETE_FRIEND:
        return deleteUserFriend(txnId, jRequest);
      case constants.commands.FRIEND_GENERATE_INVITE:
        return generateFriendInvite(txnId, jRequest);
      case constants.commands.FRIEND_GET_INVITE:
        return getFriendInvite(txnId, jRequest);
      case constants.commands.FRIEND_USE_INVITE:
        return useFriendInvite(txnId, jRequest);
      case constants.commands.FRIEND_LIST_MY_INVITES:
        return listMyFriendInvites(txnId, jRequest);
      case constants.commands.FRIEND_CHECK_SECRET_CHATROOM:
        return checkSecretChatRoom(txnId, jRequest);
      case constants.commands.FRIEND_FIND_PREFERRED_CHATROOM:
        return findPreferredChatRoom(txnId, jRequest);
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

/* -------------------- 친구 추가 -------------------- */
const addUserFriend = async (txnId, jRequest) => {
  let jResponse = {};
  let sql = null;

  try {
    const { systemCode, userId, friendId } = jRequest;

    // 자기 자신 추가 방지 필요
    // 이미 친구인 사람은 추가 방지 필요
    if (!friendId || userId === friendId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Invalid friendId";
      return jResponse;
    }

    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "insert_TB_COR_USER_FRIEND",
      1,
    );

    const insert_TB_COR_USER_FRIEND_01 = await database.executeSQL(
      sql,
      [systemCode, userId, friendId],
    );

    if (insert_TB_COR_USER_FRIEND_01.rowCount === 1) {
      jResponse.error_code = constants.errorCode.Success;
    } else {
      jResponse.error_code = constants.errorCode.DBCUDError;
      jResponse.error_message = "FAILED_TO_ADD_FRIEND";
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const addFriendRelation = async (systemCode, userId, friendId) => {
  if (!friendId || userId === friendId) {
    return { skipped: true, rowCount: 0 };
  }

  const sql = await dynamicSql.getSQL(
    systemCode,
    "insert_TB_COR_USER_FRIEND",
    1,
  );

  const result = await database.executeSQL(sql, [systemCode, userId, friendId]);
  return { skipped: false, rowCount: result.rowCount };
};

/* -------------------- 친구 차단 -------------------- */
const blockUserFriend = async (txnId, jRequest) => {
  let jResponse = {};
  let sql = null;

  try {
    const { systemCode, userId, friendId } = jRequest;

    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "update_TB_COR_USER_FRIEND",
      1,
    );

    const update_TB_COR_USER_FRIEND_01 = await database.executeSQL(
      sql,
      [systemCode, userId, friendId],
    );

    if (update_TB_COR_USER_FRIEND_01.rowCount === 1) {
      jResponse.error_code = constants.errorCode.Success;
    } else {
      jResponse.error_code = constants.errorCode.DBCUDError;
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* -------------------- 친구 차단 해제 -------------------- */
const unblockUserFriend = async (txnId, jRequest) => {
  let jResponse = {};
  let sql = null;

  try {
    const { systemCode, userId, friendId } = jRequest;

    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "update_TB_COR_USER_FRIEND",
      2,
    );

    const update_TB_COR_USER_FRIEND_02 = await database.executeSQL(
      sql,
      [systemCode, userId, friendId],
    );

    if (update_TB_COR_USER_FRIEND_02.rowCount === 1) {
      jResponse.error_code = constants.errorCode.Success;
    } else {
      jResponse.error_code = constants.errorCode.DBCUDError;
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* -------------------- 친구 목록 조회 -------------------- */
const getFriendListByUser = async (txnId, jRequest) => {
  let jResponse = {};
  let sql = null;

  try {
    const { systemCode, userId } = jRequest;

    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_USER_FRIEND",
      1,
    );

    const select_TB_COR_USER_FRIEND_01 = await database.executeSQL(
      sql,
      [systemCode, userId],
    );

    const withPhones = await attachUserPhoneNumbers(
      systemCode,
      select_TB_COR_USER_FRIEND_01.rows,
      (row) => row.friend_id || row.friendId || row.user_id || row.userId,
    );

    let rows = withPhones;
    try {
      const profileSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_USER_FRIEND", 2);
      const profileResult = await database.executeSQL(profileSql, [systemCode, userId]);
      const profileMap = new Map(profileResult.rows.map((r) => [r.friend_id, r.profile_image_src || null]));
      rows = withPhones.map((row) => {
        const fid = row.friend_id || row.friendId || row.user_id || row.userId;
        return { ...row, profile_image_src: profileMap.get(fid) || null };
      });
    } catch { /* 프로필 이미지 조회 실패 시 무시하고 기존 데이터 반환 */ }

    jResponse.error_code = constants.errorCode.Success;
    jResponse.data = rows;
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* -------------------- 사용자 검색 -------------------- */
const searchUsersByKeyword = async (txnId, jRequest) => {
  let jResponse = {};
  let sql = null;

  try {
    const { systemCode, userId, keyword } = jRequest;

    if (!keyword || keyword.trim().length === 0) {
      jResponse.error_code = constants.errorCode.Success;
      jResponse.data = [];
      return jResponse;
    }
    if (keyword.trim().length > 50) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Field [keyword] must be 50 characters or less";
      return jResponse;
    }

    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_USER_MST",
      5,
    );

    // 자기 자신 검색 방지 필요
    // 이미 친구인 사람은 검색 제외 필요

    const select_TB_COR_USER_MST_05 = await database.executeSQL(sql, [
      systemCode,
      userId, // 🔥 자기 자신 제외 + 친구 제외용
      keyword,
    ]);

    jResponse.error_code = constants.errorCode.Success;
    jResponse.data = select_TB_COR_USER_MST_05.rows;
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* -------------------- 친구 삭제 -------------------- */
const deleteUserFriend = async (txnId, jRequest) => {
  let jResponse = {};

  try {
    const { systemCode, userId, friendId } = jRequest;

    const sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "delete_TB_COR_USER_FRIEND",
      1,
    );

    const result = await database.executeSQL(sql, [systemCode, userId, friendId]); // 내 친구 목록에서만 삭제

    if (result.rowCount >= 1) {
      jResponse.error_code = constants.errorCode.Success;
    } else {
      jResponse.error_code = constants.errorCode.DBCUDError;
      jResponse.error_message = "친구 삭제에 실패했습니다.";
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

const sendDirectChatRequestPush = async ({
  systemCode,
  roomId,
  roomName,
  requesterId,
  requesterName,
  targetUserId,
}) => {
  try {
    const selectSql = await dynamicSql.getSQL(
      systemCode,
      "select_TB_COR_PUSH_SUBSCRIPTION",
      1,
    );
    const subsResult = await database.executeSQL(selectSql, [systemCode, [targetUserId]]);

    if (subsResult.rows.length === 0) {
      logger.info(`[direct-chat-push] no subscription for user ${targetUserId}`);
      return;
    }

    const roomUrl = `/mainPages/chatRoom?roomId=${roomId}${roomName ? `&roomName=${encodeURIComponent(roomName)}` : ""}`;
    const payload = {
      title: `${requesterName || requesterId}님의 1:1 채팅 요청`,
      body: `${requesterName || requesterId}님이 1:1 채팅을 시작했어.`,
      url: roomUrl,
    };

    const expiredEndpoints = [];
    await Promise.allSettled(
      subsResult.rows.map(async (sub) => {
        const result = await sendPush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        if (result.expired) {
          expiredEndpoints.push({ userId: sub.user_id, endpoint: sub.endpoint });
        }
      }),
    );

    if (expiredEndpoints.length > 0) {
      const deleteSql = await dynamicSql.getSQL(
        systemCode,
        "delete_TB_COR_PUSH_SUBSCRIPTION",
        1,
      );
      for (const { userId, endpoint } of expiredEndpoints) {
        await database.executeSQL(deleteSql, [userId, endpoint]);
      }
    }

    logger.info(
      `[direct-chat-push] sent request notification: roomId=${roomId} requester=${requesterId} target=${targetUserId}`,
    );
  } catch (e) {
    logger.error(`[direct-chat-push] failed: ${e.message}`);
  }
};

/* -------------------- 친구 기반 채팅방 검색 -------------------- */
const checkChatRoomWithFriend = async (txnId, jRequest) => {
  let jResponse = {};
  let sql = null;

  try {
    const { systemCode, userId, friendId } = jRequest;

    /* -------------------- 1. 기존 채팅방 조회 -------------------- */
    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_CHATROOM_USERS",
      3,
    );

    const selectResult = await database.executeSQL(sql, [
      systemCode,
      userId,
      friendId,
    ]);

    if (selectResult.rowCount > 0) {
      jResponse.roomId = selectResult.rows[0].room_id;
      jResponse.roomName = selectResult.rows[0].room_name; // 같이 내려줌

      sql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "insert_TB_COR_CHATROOM_USERS",
        1,
      );

      await database.executeSQL(sql, [systemCode, jResponse.roomId, userId]);
      const addFriendResult = await database.executeSQL(sql, [
        systemCode,
        jResponse.roomId,
        friendId,
      ]);

      if (addFriendResult.rowCount === 1) {
        await sendDirectChatRequestPush({
          systemCode: deploymentSystemCode(),
          roomId: jResponse.roomId,
          roomName: jResponse.roomName,
          requesterId: userId,
          requesterName: jRequest.userName,
          targetUserId: friendId,
        });
      }
    } else {
      /* -------------------- 2. 새 채팅방 생성 -------------------- */
      const { v4: uuidv4 } = require("uuid");
      const roomId = uuidv4();

      // 🔥 상대 이름 조회 (필수)
      const friendInfoSql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "select_TB_COR_USER_MST",
        1,
      );

      const friendInfo = await database.executeSQL(friendInfoSql, [
        systemCode,
        friendId,
      ]);

      const friendName = friendInfo.rows?.[0]?.user_name || "Unknown";

      // 🔥 핵심: 서버에서 이름 확정
      const roomName = `${jRequest.userName} ◁▷ ${friendName}`;

      // 방 생성
      sql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "insert_TB_COR_CHATROOM_MST",
        3,
      );

      await database.executeSQL(sql, [systemCode, roomId, roomName, userId]);

      /* -------------------- 3. 사용자 2명 입장 -------------------- */
      sql = await dynamicSql.getSQL(
        deploymentSystemCode(),
        "insert_TB_COR_CHATROOM_USERS",
        1,
      );

      let resAddUser, resAddFriend;

      resAddUser = await database.executeSQL(sql, [systemCode, roomId, userId]);
      resAddFriend = await database.executeSQL(sql, [
        systemCode,
        roomId,
        friendId,
      ]);

      jResponse.roomId = roomId;
      jResponse.roomName = roomName;

      if (resAddFriend.rowCount === 1) {
        await sendDirectChatRequestPush({
          systemCode: deploymentSystemCode(),
          roomId,
          roomName,
          requesterId: userId,
          requesterName: jRequest.userName,
          targetUserId: friendId,
        });
      }
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

/* -------------------- 친구 초대 링크 생성 -------------------- */
const generateFriendInvite = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { v4: uuidv4 } = require("uuid");
    const { systemCode, userId } = jRequest;
    const inviteCode = uuidv4();

    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "insert_TB_COR_FRIEND_INVITE", 1);
    await database.executeSQL(sql, [inviteCode, systemCode, userId]);

    jResponse.error_code = constants.errorCode.Success;
    jResponse.inviteCode = inviteCode;
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* -------------------- 친구 초대 조회 -------------------- */
const getFriendInvite = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, inviteCode } = jRequest;
    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_FRIEND_INVITE", 1);
    const result = await database.executeSQL(sql, [inviteCode, systemCode]);

    if (result.rowCount === 0) {
      jResponse.error_code = constants.errorCode.DBSelectError;
      jResponse.error_message = "유효하지 않은 초대 링크입니다.";
    } else {
      jResponse.error_code = constants.errorCode.Success;
      jResponse.data = result.rows[0];
    }
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* -------------------- 친구 초대 사용 처리 -------------------- */
const useFriendInvite = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, userId, inviteCode } = jRequest;
    const selectSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_FRIEND_INVITE", 2);
    const inviteResult = await database.executeSQL(selectSql, [inviteCode, systemCode, userId]);

    if (inviteResult.rowCount === 0) {
      jResponse.error_code = constants.errorCode.DBSelectError;
      jResponse.error_message = "유효하지 않은 초대 링크입니다.";
      return jResponse;
    }

    const inviterId = inviteResult.rows[0].inviter_id;
    const usedAt = inviteResult.rows[0].used_at;
    const inviteeId = inviteResult.rows[0].invitee_id;

    if (!userId || !inviterId || userId === inviterId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "Invalid invite user";
      return jResponse;
    }

    if (!usedAt) {
      const updateSql = await dynamicSql.getSQL(deploymentSystemCode(), "update_TB_COR_FRIEND_INVITE", 1);
      const updateResult = await database.executeSQL(updateSql, [inviteCode, systemCode, userId]);

      if (updateResult.rowCount !== 1) {
        const retryResult = await database.executeSQL(selectSql, [inviteCode, systemCode, userId]);
        if (
          retryResult.rowCount > 0 &&
          retryResult.rows[0].invitee_id === userId
        ) {
          inviteResult.rows[0] = retryResult.rows[0];
        } else {
          jResponse.error_code = constants.errorCode.DBCUDError;
          jResponse.error_message = "친구 초대 처리에 실패했습니다.";
          return jResponse;
        }
      }
    } else if (inviteeId !== userId) {
      jResponse.error_code = constants.errorCode.ServerValidationError;
      jResponse.error_message = "이미 사용된 초대 링크입니다.";
      return jResponse;
    }

    await Promise.all([
      addFriendRelation(systemCode, userId, inviterId),
      addFriendRelation(systemCode, inviterId, userId),
    ]);

    jResponse.error_code = constants.errorCode.Success;
    jResponse.inviterId = inviterId;
    jResponse.inviteeId = userId;
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* -------------------- 내가 보낸 초대 목록 조회 -------------------- */
const listMyFriendInvites = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, userId } = jRequest;
    const sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_FRIEND_INVITE_BY_INVITER", 1);
    const result = await database.executeSQL(sql, [systemCode, userId]);

    const now = new Date();
    jResponse.error_code = constants.errorCode.Success;
    jResponse.invites = result.rows.map((row) => {
      let status;
      if (row.used_at && row.invitee_id) status = "accepted";
      else if (new Date(row.expire_at) < now) status = "expired";
      else status = "pending";
      return { invite_code: row.invite_code, status, created_at: row.created_at };
    });
  } catch (e) {
    logger.error(e);
    jResponse.error_code = constants.errorCode.ServerException;
    jResponse.error_message = e.message;
  } finally {
    return jResponse;
  }
};

/* -------------------- 비밀채팅방 찾기/생성 -------------------- */
const checkSecretChatRoom = async (txnId, jRequest) => {
  let jResponse = {};
  let sql = null;

  try {
    const { systemCode, userId, friendId } = jRequest;

    // 기존 비밀채팅방 조회 (상대방이 나간 경우도 이름 기반으로 탐색)
    sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_CHATROOM_USERS", 4);
    const existing = await database.executeSQL(sql, [systemCode, userId, friendId]);

    const addMemberSql = await dynamicSql.getSQL(deploymentSystemCode(), "insert_TB_COR_CHATROOM_USERS", 1);

    if (existing.rowCount > 0) {
      const roomId = existing.rows[0].room_id;
      jResponse.roomId = roomId;
      jResponse.roomName = existing.rows[0].room_name;
      jResponse.created = false;
      // 둘 중 나간 사용자가 있으면 재추가 (이미 멤버면 무시)
      try { await database.executeSQL(addMemberSql, [systemCode, roomId, userId]); } catch (_) {}
      try { await database.executeSQL(addMemberSql, [systemCode, roomId, friendId]); } catch (_) {}
    } else {
      const { v4: uuidv4 } = require("uuid");
      const roomId = uuidv4();

      const friendInfoSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_USER_MST", 1);
      const friendInfo = await database.executeSQL(friendInfoSql, [systemCode, friendId]);
      const friendName = friendInfo.rows?.[0]?.user_name || "Unknown";
      const roomName = `🔒 ${jRequest.userName} ◁▷ ${friendName}`;

      sql = await dynamicSql.getSQL(deploymentSystemCode(), "insert_TB_COR_CHATROOM_MST", 4);
      await database.executeSQL(sql, [systemCode, roomId, roomName, userId]);

      await database.executeSQL(addMemberSql, [systemCode, roomId, userId]);
      await database.executeSQL(addMemberSql, [systemCode, roomId, friendId]);

      jResponse.roomId = roomId;
      jResponse.roomName = roomName;
      jResponse.created = true;
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

// 비밀방 우선 탐색 — 생성 없이 존재 여부만 확인 (없으면 일반방 탐색)
const findPreferredChatRoom = async (txnId, jRequest) => {
  let jResponse = {};
  try {
    const { systemCode, userId, friendId } = jRequest;

    // 1. 비밀방 탐색
    const secretSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_CHATROOM_USERS", 4);
    const secretResult = await database.executeSQL(secretSql, [systemCode, userId, friendId]);

    if (secretResult.rowCount > 0) {
      jResponse.hasSecret = true;
      jResponse.roomId = secretResult.rows[0].room_id;
      jResponse.roomName = secretResult.rows[0].room_name;
      jResponse.error_code = constants.errorCode.Success;
      return jResponse;
    }

    // 2. 일반방 탐색
    const normalSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_CHATROOM_USERS", 3);
    const normalResult = await database.executeSQL(normalSql, [systemCode, userId, friendId]);

    if (normalResult.rowCount > 0) {
      jResponse.hasNormal = true;
      jResponse.roomId = normalResult.rows[0].room_id;
      jResponse.roomName = normalResult.rows[0].room_name;
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

export { executeService };
