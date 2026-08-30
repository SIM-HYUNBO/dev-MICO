import { deploymentSystemCode } from "@/lib/tenantResolver";
import * as constants from "@/lib/constants";
import { SCHEMA } from "@/lib/dbSchema";
import * as commonFunctions from "@/lib/commonFunctions";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import { runService } from "@/lib/serviceRunner";
import { verifySession } from "@/lib/serverSession";

const SCHEMA_NAME = SCHEMA;
const q = (name) => `"${String(name).replace(/"/g, `""`)}"`;
const table = (name) => `${q(SCHEMA_NAME)}.${q(String(name).toLowerCase())}`;
const ID_FORMAT = /^[A-Za-z0-9_.-]+$/;
const MENU_TYPES = new Set(["section", "item"]);
let menuStorageReady = false;
let menuStoragePromise = null;
let menuStorageSeededSystemCodes = [];

const msg = (key, languageCode) =>
  commonFunctions.getResourceByLanguage(key, constants.resourceType.message, languageCode);

const ok = (jRequest, data = {}) => ({
  commandName: jRequest.commandName,
  error_code: constants.errorCode.Success,
  error_message: constants.emptyString,
  data,
});

const invalid = (jRequest, detail) => ({
  commandName: jRequest.commandName,
  error_code: constants.errorCode.ServerValidationError,
  error_message: detail || msg("SERVER_VALIDATION_ERROR", jRequest.languageCode),
});

const isTruthyAdmin = (flag) =>
  flag === true || String(flag).toUpperCase() === "Y" || String(flag) === "true";

const defaultScreens = [
  ["main.directChat", "directChat", "/mainPages/chatRoom?roomType=DIRECT", false, true, null],
  ["main.groupChat", "groupChat", "/mainPages/chatRoom?roomType=GROUP", false, true, null],
  ["main.openChat", "openChat", "/mainPages/openChat", false, true, null],
  ["main.friends", "userFriendManagement", "/mainPages/userFriendManagement", false, true, null],
  ["main.eDocDesigner", "eDocDesigner", "/mainPages/eDocDesigner", false, true, null],
  ["main.schedule", "schedule", "/mainPages/schedule", false, true, null],
  ["main.calculator", "calculator", "/mainPages/calculator", false, true, null],
  ["main.complaint", "complaint", "/mainPages/complaint", false, true, null],
  ["account.signin", "homeSignin", "/mainPages/signin", false, false, null],
  ["account.signup", "homeSignup", "/mainPages/signup", false, false, null],
  ["admin.transactionHistory", "transactionHistory", "/mainPages/transactionHistory", true, true, null],
  ["admin.userActivityDashboard", "userActivityDashboard", "/mainPages/userActivityDashboard", true, true, null],
  ["admin.dbUsage", "adminDbUsageTitle", "/mainPages/adminDbUsage", true, true, null],
  ["admin.railwayDeploy", "adminRailwayDeployTitle", "/admin/railway-deploy", true, true, null],
  ["admin.resourceText", "adminResourceTextTitle", "/admin/resource-text", true, true, null],
  ["admin.menu", "adminMenuManageTitle", "/admin/menu", true, true, null],
  ["admin.dynamicSql", "dynamicSql", "/mainPages/dynamicSql", true, true, null],
];

const defaultMenus = [
  ["section.public", "section", null, null, null, "publicMenuSection", false, true, false, false, 100],
  ["main.directChat", "item", "section.public", "main.directChat", "/mainPages/chatRoom?roomType=DIRECT", "directChat", false, true, false, false, 110],
  ["main.groupChat", "item", "section.public", "main.groupChat", "/mainPages/chatRoom?roomType=GROUP", "groupChat", false, true, false, false, 120],
  ["main.openChat", "item", "section.public", "main.openChat", "/mainPages/openChat", "openChat", false, true, false, false, 130],
  ["main.eDocDesigner", "item", "section.public", "main.eDocDesigner", "/mainPages/eDocDesigner", "eDocDesigner", false, true, false, false, 140],
  ["main.schedule", "item", "section.public", "main.schedule", "/mainPages/schedule", "schedule", false, true, false, false, 150],
  ["main.calculator", "item", "section.public", "main.calculator", "/mainPages/calculator", "calculator", false, true, false, false, 160],
  ["main.complaint", "item", "section.public", "main.complaint", "/mainPages/complaint", "complaint", false, true, false, false, 170],
  ["section.account", "section", null, null, null, "accountMenuSection", false, false, true, false, 200],
  ["account.signin", "item", "section.account", "account.signin", "/mainPages/signin", "homeSignin", false, false, true, false, 210],
  ["account.signup", "item", "section.account", "account.signup", "/mainPages/signup", "homeSignup", false, false, true, false, 220],
  ["section.admin", "section", null, null, null, "adminMenuSection", true, true, false, true, 900],
  ["admin.transactionHistory", "item", "section.admin", "admin.transactionHistory", "/mainPages/transactionHistory", "transactionHistory", true, true, false, false, 910],
  ["admin.userActivityDashboard", "item", "section.admin", "admin.userActivityDashboard", "/mainPages/userActivityDashboard", "userActivityDashboard", true, true, false, false, 920],
  ["admin.dbUsage", "item", "section.admin", "admin.dbUsage", "/mainPages/adminDbUsage", "adminDbUsageTitle", true, true, false, false, 930],
  ["admin.railwayDeploy", "item", "section.admin", "admin.railwayDeploy", "/admin/railway-deploy", "adminRailwayDeployTitle", true, true, false, false, 940],
  ["admin.resourceText", "item", "section.admin", "admin.resourceText", "/admin/resource-text", "adminResourceTextTitle", true, true, false, false, 950],
  ["admin.menu", "item", "section.admin", "admin.menu", "/admin/menu", "adminMenuManageTitle", true, true, false, false, 960],
  ["admin.dynamicSql", "item", "section.admin", "admin.dynamicSql", "/mainPages/dynamicSql", "dynamicSql", true, true, false, false, 970],
  ["section.mobileTabBar", "section", null, null, null, "mobileBottomNav", false, true, false, false, 1000, "mobileTabBar", null],
  ["tab.chat", "item", "section.mobileTabBar", "main.directChat", "/mainPages/chatRoom?roomType=DIRECT", "TAB_CHAT", false, true, false, false, 1010, "mobileTabBar", "chat"],
  ["tab.friends", "item", "section.mobileTabBar", "main.friends", "/mainPages/userFriendManagement", "TAB_FRIENDS", false, true, false, false, 1020, "mobileTabBar", "friends"],
  ["tab.schedule", "item", "section.mobileTabBar", "main.schedule", "/mainPages/schedule", "TAB_SCHEDULE", false, true, false, false, 1030, "mobileTabBar", "schedule"],
];

const seedSystemCodes = () =>
  [...new Set(["00", "01", "02", deploymentSystemCode()].filter((code) => /^[A-Za-z0-9]{2}$/.test(code)))];

const ensureMenuStorage = async () => {
  if (menuStorageReady) return;
  if (menuStoragePromise) return menuStoragePromise;

  menuStoragePromise = (async () => {
    await database.executeSQL(`CREATE SCHEMA IF NOT EXISTS ${q(SCHEMA_NAME)}`);
    await database.executeSQL(`
      DO $$
      BEGIN
        IF to_regclass('${SCHEMA_NAME}."TB_COR_SCREEN"') IS NOT NULL
           AND to_regclass('${SCHEMA_NAME}.tb_cor_screen') IS NULL THEN
          ALTER TABLE ${q(SCHEMA_NAME)}."TB_COR_SCREEN" RENAME TO tb_cor_screen;
        END IF;
        IF to_regclass('${SCHEMA_NAME}."TB_COR_MENU"') IS NOT NULL
           AND to_regclass('${SCHEMA_NAME}.tb_cor_menu') IS NULL THEN
          ALTER TABLE ${q(SCHEMA_NAME)}."TB_COR_MENU" RENAME TO tb_cor_menu;
        END IF;
      END $$`);
    await database.executeSQL(`
      CREATE TABLE IF NOT EXISTS ${table("TB_COR_SCREEN")} (
        SYSTEM_CODE VARCHAR(2) NOT NULL,
        SCREEN_ID VARCHAR(100) NOT NULL,
        SCREEN_NAME_KEY VARCHAR(200) NOT NULL,
        ROUTE_PATH VARCHAR(500) NOT NULL,
        SCREEN_SCOPE VARCHAR(20) NOT NULL DEFAULT 'common',
        ADMIN_ONLY BOOLEAN NOT NULL DEFAULT FALSE,
        LOGIN_REQUIRED BOOLEAN NOT NULL DEFAULT TRUE,
        ALLOWED_USER_TYPES VARCHAR(500),
        IS_ACTIVE BOOLEAN NOT NULL DEFAULT TRUE,
        CREATE_USER_ID VARCHAR(100),
        CREATE_TIME TIMESTAMP DEFAULT NOW(),
        UPDATE_USER_ID VARCHAR(100),
        UPDATE_TIME TIMESTAMP,
        PRIMARY KEY (SYSTEM_CODE, SCREEN_ID)
      )`);
    await database.executeSQL(`
      CREATE TABLE IF NOT EXISTS ${table("TB_COR_MENU")} (
        SYSTEM_CODE VARCHAR(2) NOT NULL,
        MENU_ID VARCHAR(100) NOT NULL,
        MENU_TYPE VARCHAR(20) NOT NULL DEFAULT 'item',
        PARENT_MENU_ID VARCHAR(100),
        SCREEN_ID VARCHAR(100),
        HREF VARCHAR(500),
        LABEL_RESOURCE_KEY VARCHAR(200) NOT NULL,
        ICON_NAME VARCHAR(100),
        ADMIN_ONLY BOOLEAN NOT NULL DEFAULT FALSE,
        LOGIN_REQUIRED BOOLEAN NOT NULL DEFAULT TRUE,
        HIDE_WHEN_LOGGED_IN BOOLEAN NOT NULL DEFAULT FALSE,
        INITIALLY_OPEN BOOLEAN NOT NULL DEFAULT FALSE,
        SORT_ORDER INT NOT NULL DEFAULT 1000,
        IS_VISIBLE BOOLEAN NOT NULL DEFAULT TRUE,
        MENU_SCOPE VARCHAR(20) NOT NULL DEFAULT 'common',
        CREATE_USER_ID VARCHAR(100),
        CREATE_TIME TIMESTAMP DEFAULT NOW(),
        UPDATE_USER_ID VARCHAR(100),
        UPDATE_TIME TIMESTAMP,
        PRIMARY KEY (SYSTEM_CODE, MENU_ID)
      )`);
    await database.executeSQL(
      `CREATE INDEX IF NOT EXISTS ${q(`idx_${SCHEMA_NAME}_tb_cor_menu_parent`)}
       ON ${table("TB_COR_MENU")}(SYSTEM_CODE, PARENT_MENU_ID, SORT_ORDER)`,
    );
    await database.executeSQL(
      `CREATE INDEX IF NOT EXISTS ${q(`idx_${SCHEMA_NAME}_tb_cor_menu_screen`)}
       ON ${table("TB_COR_MENU")}(SYSTEM_CODE, SCREEN_ID)`,
    );
    await database.executeSQL(
      `ALTER TABLE ${table("TB_COR_SCREEN")}
       ADD COLUMN IF NOT EXISTS ADMIN_ONLY BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    await database.executeSQL(
      `ALTER TABLE ${table("TB_COR_SCREEN")}
       ADD COLUMN IF NOT EXISTS LOGIN_REQUIRED BOOLEAN NOT NULL DEFAULT TRUE`,
    );
    await database.executeSQL(
      `ALTER TABLE ${table("TB_COR_SCREEN")}
       ADD COLUMN IF NOT EXISTS ALLOWED_USER_TYPES VARCHAR(500)`,
    );
    await database.executeSQL(
      `ALTER TABLE ${table("TB_COR_MENU")}
       ADD COLUMN IF NOT EXISTS INITIALLY_OPEN BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    await database.executeSQL(
      `ALTER TABLE ${table("TB_COR_MENU")}
       ADD COLUMN IF NOT EXISTS ICON_NAME VARCHAR(100)`,
    );
    const legacyMenuAllowedUserTypes = await database.executeSQL(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = $1
         AND table_name = 'tb_cor_menu'
         AND column_name = 'allowed_user_types'
       LIMIT 1`,
      [SCHEMA_NAME],
    );
    if (legacyMenuAllowedUserTypes.rowCount > 0) {
      await database.executeSQL(`
        UPDATE ${table("TB_COR_SCREEN")} s
        SET ALLOWED_USER_TYPES = m.ALLOWED_USER_TYPES,
            UPDATE_USER_ID = COALESCE(s.UPDATE_USER_ID, 'system'),
            UPDATE_TIME = NOW()
        FROM ${table("TB_COR_MENU")} m
        WHERE s.SYSTEM_CODE = m.SYSTEM_CODE
          AND s.SCREEN_ID = m.SCREEN_ID
          AND s.ALLOWED_USER_TYPES IS NULL
          AND m.ALLOWED_USER_TYPES IS NOT NULL
          AND btrim(m.ALLOWED_USER_TYPES) <> ''`);
    }

    const systemCodes = seedSystemCodes();
    for (const systemCode of systemCodes) {
      for (const [screenId, labelKey, routePath, adminOnly, loginRequired, allowedUserTypes] of defaultScreens) {
        await database.executeSQL(
          `INSERT INTO ${table("TB_COR_SCREEN")} AS target_screen
             (SYSTEM_CODE, SCREEN_ID, SCREEN_NAME_KEY, ROUTE_PATH, SCREEN_SCOPE,
              ADMIN_ONLY, LOGIN_REQUIRED, ALLOWED_USER_TYPES, CREATE_USER_ID, UPDATE_USER_ID, UPDATE_TIME)
           VALUES ($1, $2, $3, $4, 'common', $5, $6, $7, 'system', 'system', NOW())
           ON CONFLICT (SYSTEM_CODE, SCREEN_ID) DO UPDATE SET
             ADMIN_ONLY = EXCLUDED.ADMIN_ONLY,
             LOGIN_REQUIRED = EXCLUDED.LOGIN_REQUIRED,
             ALLOWED_USER_TYPES = EXCLUDED.ALLOWED_USER_TYPES,
             UPDATE_USER_ID = EXCLUDED.UPDATE_USER_ID,
             UPDATE_TIME = NOW()
           WHERE target_screen.CREATE_USER_ID = 'system'`,
          [systemCode, screenId, labelKey, routePath, adminOnly, loginRequired, allowedUserTypes],
        );
      }

      for (const [
        menuId,
        menuType,
        parentMenuId,
        screenId,
        href,
        labelKey,
        adminOnly,
        loginRequired,
        hideWhenLoggedIn,
        initiallyOpen,
        sortOrder,
        menuScope = "common",
        iconName = null,
      ] of defaultMenus) {
        await database.executeSQL(
          `INSERT INTO ${table("TB_COR_MENU")} AS target_menu
             (SYSTEM_CODE, MENU_ID, MENU_TYPE, PARENT_MENU_ID, SCREEN_ID, HREF, LABEL_RESOURCE_KEY, ICON_NAME,
              ADMIN_ONLY, LOGIN_REQUIRED, HIDE_WHEN_LOGGED_IN, INITIALLY_OPEN, SORT_ORDER,
              MENU_SCOPE, CREATE_USER_ID, UPDATE_USER_ID, UPDATE_TIME)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'system', 'system', NOW())
           ON CONFLICT (SYSTEM_CODE, MENU_ID) DO UPDATE SET
             MENU_TYPE = EXCLUDED.MENU_TYPE,
             PARENT_MENU_ID = EXCLUDED.PARENT_MENU_ID,
             SCREEN_ID = EXCLUDED.SCREEN_ID,
             HREF = EXCLUDED.HREF,
             LABEL_RESOURCE_KEY = EXCLUDED.LABEL_RESOURCE_KEY,
             ICON_NAME = EXCLUDED.ICON_NAME,
             ADMIN_ONLY = EXCLUDED.ADMIN_ONLY,
             LOGIN_REQUIRED = EXCLUDED.LOGIN_REQUIRED,
             HIDE_WHEN_LOGGED_IN = EXCLUDED.HIDE_WHEN_LOGGED_IN,
             INITIALLY_OPEN = EXCLUDED.INITIALLY_OPEN,
             SORT_ORDER = EXCLUDED.SORT_ORDER,
             MENU_SCOPE = EXCLUDED.MENU_SCOPE,
             UPDATE_USER_ID = EXCLUDED.UPDATE_USER_ID,
             UPDATE_TIME = NOW()
           WHERE target_menu.CREATE_USER_ID = 'system'`,
          [
            systemCode,
            menuId,
            menuType,
            parentMenuId,
            screenId,
            href,
            labelKey,
            iconName,
            adminOnly,
            loginRequired,
            hideWhenLoggedIn,
            initiallyOpen,
            sortOrder,
            menuScope,
          ],
        );
      }
    }

    menuStorageSeededSystemCodes = systemCodes;
    menuStorageReady = true;
  })();

  try {
    await menuStoragePromise;
  } finally {
    menuStoragePromise = null;
  }
};

const requesterState = async (jRequest) => {
  const userId = String(jRequest.userId || "").trim();
  const authed =
    userId &&
    (await verifySession(SCHEMA_NAME, deploymentSystemCode(), userId, jRequest.sessionToken));
  if (!authed) return { loggedIn: false, admin: false };

  const userSql = await dynamicSql.getSQL(deploymentSystemCode(), "select_TB_COR_USER_MST", 1);
  const user = await database.executeSQL(userSql, [deploymentSystemCode(), userId]);
  return {
    loggedIn: true,
    admin: jRequest.adminMode !== false && isTruthyAdmin(user.rows[0]?.admin_flag),
    userType: String(user.rows[0]?.user_type || ""),
  };
};

const assertAdmin = async (jRequest) => (await requesterState(jRequest)).admin;

const normalizeBool = (value) => value === true || String(value).toUpperCase() === "Y";
const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);

const selectMenu = async (txnId, jRequest) => {
  await ensureMenuStorage();
  const state = await requesterState(jRequest);
  const sql = `
    SELECT
      m.menu_id, m.menu_type, m.parent_menu_id, m.label_resource_key,
      COALESCE(m.href, s.route_path) AS href, m.admin_only, m.login_required,
      m.hide_when_logged_in, m.initially_open, m.icon_name,
      s.admin_only AS screen_admin_only, s.login_required AS screen_login_required,
      s.allowed_user_types AS screen_allowed_user_types,
      m.sort_order, m.menu_scope, m.screen_id, s.route_path,
      p.label_resource_key AS parent_label_resource_key
    FROM ${table("TB_COR_MENU")} m
    LEFT JOIN ${table("TB_COR_SCREEN")} s
      ON s.system_code = m.system_code
     AND s.screen_id = m.screen_id
     AND s.is_active = TRUE
    LEFT JOIN ${table("TB_COR_MENU")} p
      ON p.system_code = m.system_code
     AND p.menu_id = m.parent_menu_id
    WHERE m.system_code = $1
      AND m.is_visible = TRUE
      AND (m.screen_id IS NULL OR s.screen_id IS NOT NULL)
      AND ($2::boolean = TRUE OR m.login_required = FALSE)
      AND ($2::boolean = TRUE OR COALESCE(s.login_required, FALSE) = FALSE)
      AND ($2::boolean = FALSE OR m.hide_when_logged_in = FALSE)
      AND ($3::boolean = TRUE OR m.admin_only = FALSE)
      AND ($3::boolean = TRUE OR COALESCE(s.admin_only, FALSE) = FALSE)
      AND (
        s.allowed_user_types IS NULL OR btrim(s.allowed_user_types) = ''
        OR $4::text = ANY(string_to_array(replace(s.allowed_user_types, ' ', ''), ','))
      )
      AND (m.menu_type = 'section' OR COALESCE(m.href, s.route_path) IS NOT NULL)
    ORDER BY m.sort_order, m.menu_id`;
  const result = await database.executeSQL(sql, [
    deploymentSystemCode(),
    state.loggedIn,
    state.admin,
    state.userType || "",
  ]);
  return ok(jRequest, {
    menus: result.rows || [],
    source: "db",
    seededSystemCodes: menuStorageSeededSystemCodes,
  });
};

const adminSelect = async (txnId, jRequest) => {
  if (!(await assertAdmin(jRequest))) return invalid(jRequest, msg("NO_PERMISSION", jRequest.languageCode));
  await ensureMenuStorage();

  const screens = await database.executeSQL(
    `SELECT * FROM ${table("TB_COR_SCREEN")} WHERE system_code = $1 ORDER BY screen_scope, screen_id`,
    [deploymentSystemCode()],
  );
  const menus = await database.executeSQL(
    `SELECT * FROM ${table("TB_COR_MENU")} WHERE system_code = $1 ORDER BY sort_order, menu_id`,
    [deploymentSystemCode()],
  );
  return ok(jRequest, { screens: screens.rows || [], menus: menus.rows || [] });
};

const saveScreen = async (txnId, jRequest) => {
  if (!(await assertAdmin(jRequest))) return invalid(jRequest, msg("NO_PERMISSION", jRequest.languageCode));
  await ensureMenuStorage();
  const screenId = clean(jRequest.screenId, 100);
  const screenNameKey = clean(jRequest.screenNameKey || jRequest.labelResourceKey, 200);
  const routePath = clean(jRequest.routePath, 500);
  const screenScope = clean(jRequest.screenScope || "app", 20);
  if (!screenId || !ID_FORMAT.test(screenId) || !screenNameKey || !routePath.startsWith("/")) {
    return invalid(jRequest);
  }
  await database.executeSQL(
    `INSERT INTO ${table("TB_COR_SCREEN")}
       (system_code, screen_id, screen_name_key, route_path, screen_scope, is_active,
        admin_only, login_required, allowed_user_types, create_user_id, update_user_id, update_time)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, NOW())
     ON CONFLICT (system_code, screen_id)
     DO UPDATE SET screen_name_key = EXCLUDED.screen_name_key,
       route_path = EXCLUDED.route_path, screen_scope = EXCLUDED.screen_scope,
       is_active = EXCLUDED.is_active, update_user_id = EXCLUDED.update_user_id,
       admin_only = EXCLUDED.admin_only, login_required = EXCLUDED.login_required,
       allowed_user_types = EXCLUDED.allowed_user_types,
       update_time = NOW()`,
    [
      deploymentSystemCode(),
      screenId,
      screenNameKey,
      routePath,
      screenScope,
      normalizeBool(jRequest.isActive ?? true),
      normalizeBool(jRequest.adminOnly),
      normalizeBool(jRequest.loginRequired ?? true),
      clean(jRequest.allowedUserTypes, 500) || null,
      jRequest.userId || "admin",
    ],
  );
  return ok(jRequest, { screenId });
};

const deleteScreen = async (txnId, jRequest) => {
  if (!(await assertAdmin(jRequest))) return invalid(jRequest, msg("NO_PERMISSION", jRequest.languageCode));
  await ensureMenuStorage();
  const screenId = clean(jRequest.screenId, 100);
  await database.executeSQL(
    `DELETE FROM ${table("TB_COR_SCREEN")} WHERE system_code = $1 AND screen_id = $2`,
    [deploymentSystemCode(), screenId],
  );
  return ok(jRequest, { screenId });
};

const saveMenuItem = async (txnId, jRequest) => {
  if (!(await assertAdmin(jRequest))) return invalid(jRequest, msg("NO_PERMISSION", jRequest.languageCode));
  await ensureMenuStorage();
  const menuId = clean(jRequest.menuId, 100);
  const menuType = clean(jRequest.menuType || "item", 20);
  const parentMenuId = clean(jRequest.parentMenuId, 100) || null;
  const screenId = clean(jRequest.screenId, 100) || null;
  const href = clean(jRequest.href, 500) || null;
  const labelResourceKey = clean(jRequest.labelResourceKey, 200);
  const iconName = clean(jRequest.iconName, 100) || null;
  const sortOrder = Number.isInteger(Number(jRequest.sortOrder)) ? Number(jRequest.sortOrder) : 1000;
  if (!menuId || !ID_FORMAT.test(menuId) || !MENU_TYPES.has(menuType) || !labelResourceKey) {
    return invalid(jRequest);
  }
  if (menuType === "section" && (screenId || href)) return invalid(jRequest);
  if (menuType === "item" && !screenId && !href) return invalid(jRequest);

  if (parentMenuId) {
    const parent = await database.executeSQL(
      `SELECT screen_id, href FROM ${table("TB_COR_MENU")}
       WHERE system_code = $1 AND menu_id = $2`,
      [deploymentSystemCode(), parentMenuId],
    );
    if (parent.rowCount === 0 || parent.rows[0]?.screen_id || parent.rows[0]?.href) {
      return invalid(jRequest);
    }
  }

  const children = await database.executeSQL(
    `SELECT COUNT(*)::int AS count FROM ${table("TB_COR_MENU")}
     WHERE system_code = $1 AND parent_menu_id = $2`,
    [deploymentSystemCode(), menuId],
  );
  if (Number(children.rows[0]?.count || 0) > 0 && (screenId || href || menuType !== "section")) {
    return invalid(jRequest);
  }

  await database.executeSQL(
    `INSERT INTO ${table("TB_COR_MENU")}
       (system_code, menu_id, menu_type, parent_menu_id, screen_id, href, label_resource_key, icon_name,
        admin_only, login_required, hide_when_logged_in,
        initially_open, sort_order, is_visible, menu_scope,
        create_user_id, update_user_id, update_time)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16, NOW())
     ON CONFLICT (system_code, menu_id)
     DO UPDATE SET menu_type = EXCLUDED.menu_type, parent_menu_id = EXCLUDED.parent_menu_id,
       screen_id = EXCLUDED.screen_id, href = EXCLUDED.href,
        label_resource_key = EXCLUDED.label_resource_key, icon_name = EXCLUDED.icon_name, admin_only = EXCLUDED.admin_only,
       login_required = EXCLUDED.login_required,
       hide_when_logged_in = EXCLUDED.hide_when_logged_in,
       initially_open = EXCLUDED.initially_open,
       sort_order = EXCLUDED.sort_order,
       is_visible = EXCLUDED.is_visible, menu_scope = EXCLUDED.menu_scope,
       update_user_id = EXCLUDED.update_user_id, update_time = NOW()`,
    [
      deploymentSystemCode(),
      menuId,
      menuType,
      parentMenuId,
      screenId,
      href,
      labelResourceKey,
      iconName,
      normalizeBool(jRequest.adminOnly),
      normalizeBool(jRequest.loginRequired ?? true),
      normalizeBool(jRequest.hideWhenLoggedIn),
      normalizeBool(jRequest.initiallyOpen),
      sortOrder,
      normalizeBool(jRequest.isVisible ?? true),
      clean(jRequest.menuScope || "app", 20),
      jRequest.userId || "admin",
    ],
  );
  return ok(jRequest, { menuId });
};

const deleteMenuItem = async (txnId, jRequest) => {
  if (!(await assertAdmin(jRequest))) return invalid(jRequest, msg("NO_PERMISSION", jRequest.languageCode));
  await ensureMenuStorage();
  const menuId = clean(jRequest.menuId, 100);
  const children = await database.executeSQL(
    `SELECT COUNT(*)::int AS count FROM ${table("TB_COR_MENU")}
     WHERE system_code = $1 AND parent_menu_id = $2`,
    [deploymentSystemCode(), menuId],
  );
  if (Number(children.rows[0]?.count || 0) > 0) return invalid(jRequest);
  await database.executeSQL(
    `DELETE FROM ${table("TB_COR_MENU")} WHERE system_code = $1 AND menu_id = $2`,
    [deploymentSystemCode(), menuId],
  );
  return ok(jRequest, { menuId });
};

const executeService = (txnId, jRequest) =>
  runService(txnId, jRequest, async () => {
    switch (jRequest.commandName) {
      case constants.commands.MENU_SELECT:
        return selectMenu(txnId, jRequest);
      case constants.commands.MENU_ADMIN_SELECT:
        return adminSelect(txnId, jRequest);
      case constants.commands.MENU_SCREEN_SAVE:
        return saveScreen(txnId, jRequest);
      case constants.commands.MENU_SCREEN_DELETE:
        return deleteScreen(txnId, jRequest);
      case constants.commands.MENU_ITEM_SAVE:
        return saveMenuItem(txnId, jRequest);
      case constants.commands.MENU_ITEM_DELETE:
        return deleteMenuItem(txnId, jRequest);
      default:
        throw new Error(msg("SERVER_NOT_SUPPORTED_METHOD", jRequest.languageCode));
    }
  });

export { executeService };
