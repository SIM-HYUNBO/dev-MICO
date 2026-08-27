import { deploymentSystemCode } from "@/lib/tenantResolver";
import { logger } from "@/components/core/server/winston/logger";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";

const executeService = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    switch (jRequest.commandName) {
      case constants.commands.EDOC_COMPONENT_TEMPLATES_SELECT_ALL:
        jResponse = await selectAll(txnId, jRequest);
        break;
      default:
        break;
    }
  } catch (e) {
    logger.error(`message:${e.message}\n stack:${e.stack}\n`);
  } finally {
    return jResponse;
  }
};

const selectAll = async (txnId, jRequest) => {
  var jResponse = {};

  try {
    jResponse.commandName = jRequest.commandName;
    jResponse.userId = jRequest.userId;

    var sql = null;
    sql = await dynamicSql.getSQL(
      deploymentSystemCode(),
      "select_TB_COR_EDOC_COMPONENT",
      1,
    );

    var select_TB_COR_EDOC_COMPONENT_01 = await database.executeSQL(
      sql,
      [deploymentSystemCode()],
    );

    jResponse.templateList = select_TB_COR_EDOC_COMPONENT_01.rows;

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

export { executeService };
