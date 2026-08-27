"use strict";

import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import * as constants from "@/lib/constants";
import * as r2 from "@/lib/r2Storage";
import { deploymentSystemCode } from "@/lib/tenantResolver";


export default async function handler(req, res) {
  // 테넌트는 서버가 요청으로부터 정한다.
  const SYSTEM_CODE = deploymentSystemCode();
  if (req.method !== "GET") return res.status(405).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "id required" });

  try {
    const sql = await dynamicSql.getSQL(SYSTEM_CODE, "select_TB_COR_CHAT_CUSTOM_EMOJI", 2);
    const result = await database.executeSQL(sql, [SYSTEM_CODE, id]);
    if (result.rowCount === 0) return res.status(404).end();

    const { mime_type, file_data, r2_key } = result.rows[0];

    if (r2_key) {
      // 커스텀 도메인이 있으면 엣지로 넘긴다. 이모지 키는 UUID 라 덮어쓰이지 않으므로
      // immutable 로 오래 캐시해도 안전하다.
      const cdn = r2.publicUrl(r2_key);
      if (cdn) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return res.redirect(308, cdn);
      }
      // 커스텀 도메인이 없으면 서명 URL 로. 서명 창이 끝날 때까지만 캐시한다.
      const url = await r2.getPresignedUrl(r2_key);
      res.setHeader("Cache-Control", `public, max-age=${r2.getSignWindowRemainingSeconds()}`);
      return res.redirect(302, url);
    }

    res.setHeader("Content-Type", mime_type);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(file_data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
