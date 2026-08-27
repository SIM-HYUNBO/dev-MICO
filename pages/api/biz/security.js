import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import * as authService from "@/pages/api/biz/security/authService";
import * as userService from "@/pages/api/biz/security/userService";
import * as passwordService from "@/pages/api/biz/security/passwordService";
import * as emailService from "@/pages/api/biz/security/emailService";
import { runService } from "@/lib/serviceRunner";

const executeService = (txnId, jRequest) =>
  runService(txnId, jRequest, async () => {
    switch (jRequest.commandName) {
      case constants.commands.SECURITY_SIGNUP:
        return userService.signup(txnId, jRequest);
      case constants.commands.SECURITY_SIGNIN:
        return authService.signin(txnId, jRequest);
      case constants.commands.SECURITY_REFRESH_SESSION:
        return authService.refreshSession(txnId, jRequest);
      case constants.commands.SECURITY_SIGNOUT:
        return authService.signout(txnId, jRequest);
      case constants.commands.SECURITY_RESET_PASSWORD:
        return passwordService.resetPassword(txnId, jRequest);
      case constants.commands.SECURITY_CHANGE_PASSWORD:
        return passwordService.changePassword(txnId, jRequest);
      case constants.commands.SECURITY_DELETE_ACCOUNT:
        return userService.deleteAccount(txnId, jRequest);
      case constants.commands.SECURITY_SEND_EMAIL_AUTHCODE:
        return emailService.sendEMailAuthCode(txnId, jRequest);
      case constants.commands.SECURITY_USER_INFO_SELECT_ONE:
        return userService.selectAccount(txnId, jRequest);
      case constants.commands.SECURITY_USER_INFO_UPDATE_ONE:
        return userService.updateAccount(txnId, jRequest);
      case constants.commands.SECURITY_USER_PARAM_SELECT_ONE:
        return userService.selectUserParamInfo(txnId, jRequest);
      case constants.commands.SECURITY_USER_PARAM_UPSERT_ONE:
        return userService.upsertUserParamInfo(txnId, jRequest);
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
