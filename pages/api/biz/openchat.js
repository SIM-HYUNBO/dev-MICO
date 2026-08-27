import { deploymentSystemCode } from "@/lib/tenantResolver";
import * as constants from "@/lib/constants";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import * as database from "@/pages/api/biz/database/database";
import { v4 as uuidv4 } from "uuid";

export const executeService = async (txnId, jRequest) => {
  switch (jRequest.commandName) {
    case constants.commands.OPENCHAT_LIST:
      return listRooms(jRequest);
    case constants.commands.OPENCHAT_CREATE:
      return createRoom(jRequest);
    case constants.commands.OPENCHAT_JOIN:
      return joinRoom(jRequest);
    case constants.commands.OPENCHAT_LEAVE:
      return leaveRoom(jRequest);
    case constants.commands.OPENCHAT_KICK:
      return kickMember(jRequest);
    default:
      return { error_code: -1, error_message: `Unsupported command: ${jRequest.commandName}` };
  }
};

const listRooms = async (jRequest) => {
  const { systemCode, category = "ALL" } = jRequest;
  const sql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_OPENCHAT_LIST", 1);
  const result = await database.executeSQL(sql, [systemCode, category]);
  return { error_code: constants.errorCode.Success, data: result.rows };
};

const createRoom = async (jRequest) => {
  const { systemCode, userId, roomName, category = "ETC", description = "", maxMembers = 100 } = jRequest;
  if (!roomName?.trim()) return { error_code: -1, error_message: "방 이름을 입력하세요." };

  const roomId = uuidv4();

  const insertRoomSql = await dynamicSql.getSQL(deploymentSystemCode(), "insert_TB_COR_OPENCHAT_MST", 1);
  const roomResult = await database.executeSQL(insertRoomSql, [
    systemCode, roomId, roomName.trim(), userId, category, description, Number(maxMembers) || 100,
  ]);
  if (roomResult.rowCount !== 1) return { error_code: -1, error_message: "방 개설에 실패했습니다." };

  const joinSql = await dynamicSql.getSQL(deploymentSystemCode(), "insert_TB_COR_CHATROOM_USERS", 1);
  await database.executeSQL(joinSql, [systemCode, roomId, userId]);

  return { error_code: constants.errorCode.Success, roomId, roomName: roomName.trim() };
};

const joinRoom = async (jRequest) => {
  const { systemCode, userId, roomId } = jRequest;

  const roomSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_OPENCHAT_LIST", 2);
  const roomResult = await database.executeSQL(roomSql, [systemCode, roomId]);
  if (!roomResult.rows.length) return { error_code: -1, error_message: "존재하지 않는 방입니다." };

  const room = roomResult.rows[0];
  if (Number(room.member_count) >= Number(room.max_members)) {
    return { error_code: -1, error_message: "인원이 가득 찼습니다." };
  }

  const joinSql = await dynamicSql.getSQL(deploymentSystemCode(), "insert_TB_COR_CHATROOM_USERS", 1);
  await database.executeSQL(joinSql, [systemCode, roomId, userId]);

  return { error_code: constants.errorCode.Success, roomId, roomName: room.name };
};

const leaveRoom = async (jRequest) => {
  const { systemCode, userId, roomId } = jRequest;

  const leaveSql = await dynamicSql.getSQL(deploymentSystemCode(), "delete_TB_COR_CHATROOM_USERS", 1);
  await database.executeSQL(leaveSql, [systemCode, roomId, userId]);

  return { error_code: constants.errorCode.Success };
};

const kickMember = async (jRequest) => {
  const { systemCode, userId, roomId, targetUserId } = jRequest;

  const roomSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_OPENCHAT_LIST", 2);
  const roomResult = await database.executeSQL(roomSql, [systemCode, roomId]);
  if (!roomResult.rows.length) return { error_code: -1, error_message: "존재하지 않는 방입니다." };
  if (roomResult.rows[0].owner_id !== userId) return { error_code: -1, error_message: "방장만 내보낼 수 있습니다." };

  const kickSql = await dynamicSql.getSQL(deploymentSystemCode(), "delete_TB_COR_CHATROOM_USERS", 1);
  await database.executeSQL(kickSql, [systemCode, roomId, targetUserId]);

  return { error_code: constants.errorCode.Success };
};
