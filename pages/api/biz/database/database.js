"use strict";

import { logger } from "@/components/core/server/winston/logger";
import { Pool } from "pg";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";

let pool = null;

const getPool = async () => {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    pool = new Pool({
      connectionString,
      max: parseInt(process.env.DB_POOL_MAX || "10", 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: (() => {
        if (!process.env.SSL_MODE) return false;
        try {
          const parsed = JSON.parse(process.env.SSL_MODE);
          return typeof parsed === "object" ? parsed : parsed === true;
        } catch {
          return process.env.SSL_MODE === "true";
        }
      })(),
    });
  }
  return pool;
};

const executeSQL = async (sql, params = []) => {
  try {
    if (!sql)
      throw new Error(
        commonFunctions.getResourceByLanguage(
          `SERVER_SQL_NOT_LOADED`,
          constants.resourceType.message,
        ),
      );

    if (process.env.LOG_SQL === "true") {
      const log = await formatPgSQLForLog(sql, params);
      logger.info(`SQL (executed):\n${log}\n`);
    }

    const pool = await getPool();
    return await pool.query(sql, params);
  } catch (e) {
    logger.error(`SQL Execution Error: ${e.message}`);
    throw e; // 호출 측에서 try/catch 처리
  }
};

export const formatPgSQLForLog = async (sql, params = []) => {
  if (!params.length) return sql;

  const escapeString = (str) => str.replace(/\\/g, "\\\\").replace(/'/g, "''");

  const formatValue = (val) => {
    if (val === null || val === undefined) return "NULL";

    // number
    if (typeof val === "number") return val;

    // boolean
    if (typeof val === "boolean") return val ? "true" : "false";

    // Date
    if (val instanceof Date) {
      return `'${val.toISOString()}'`;
    }

    // Buffer (bytea)
    if (Buffer.isBuffer(val)) {
      return `'\\x${val.toString("hex")}'`;
    }

    // Array
    if (Array.isArray(val)) {
      return `ARRAY[${val.map(formatValue).join(", ")}]`;
    }

    // JSON / Object
    if (typeof val === "object") {
      return `'${escapeString(JSON.stringify(val))}'::jsonb`;
    }

    // string
    return `'${escapeString(String(val))}'`;
  };

  return sql.replace(/\$(\d+)/g, (_, index) => {
    const i = Number(index) - 1;
    return i in params ? formatValue(params[i]) : `$${index}`;
  });
};

export { executeSQL };
