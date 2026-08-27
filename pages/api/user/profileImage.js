"use strict";
// 프로필 사진 서빙 — R2 에 있는 사진을 서명 URL 로 넘긴다.
// 이관 전 옛 행은 PROFILE_IMAGE_SRC 에 data URL 이 그대로 들어 있어 화면이 직접
// 렌더하므로 이 경로를 타지 않는다. 그래도 안전하게 폴백을 둔다.
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import * as constants from "@/lib/constants";
import * as r2 from "@/lib/r2Storage";
import { deploymentSystemCode } from "@/lib/tenantResolver";


export default async function handler(req, res) {
  // 테넌트는 서버가 요청으로부터 정한다.
  const SYSTEM_CODE = deploymentSystemCode();
  if (req.method !== "GET") return res.status(405).end();

  const userId = String(req.query.u || "").trim();
  if (!userId) return res.status(400).json({ error: "u required" });

  try {
    const sql = await dynamicSql.getSQL(SYSTEM_CODE, "select_TB_COR_USER_PROFILE_IMAGE", 1);
    const result = await database.executeSQL(sql, [SYSTEM_CODE, userId]);
    if (result.rowCount === 0) return res.status(404).end();

    const { profile_image_key, profile_image_src } = result.rows[0];

    if (profile_image_key) {
      // 커스텀 도메인이 있으면 엣지로 넘긴다. 이 경로는 이관 전에 저장된 옛 행이
      // 타는 길이고, 새로 저장되는 행은 DB 에 엣지 URL 이 바로 들어간다.
      const cdn = r2.publicUrl(profile_image_key);
      if (cdn) {
        res.setHeader("Cache-Control", "public, max-age=300");
        return res.redirect(302, cdn);
      }
      const url = await r2.getPresignedUrl(profile_image_key);
      res.setHeader("Cache-Control", `private, max-age=${r2.getSignWindowRemainingSeconds()}`);
      return res.redirect(302, url);
    }

    // 아직 이관되지 않은 data URL — 바이트로 풀어서 직접 내려준다.
    if (typeof profile_image_src === "string" && profile_image_src.startsWith("data:image/")) {
      const [header, base64Data] = profile_image_src.split(",");
      const mimeType = header.match(/data:([^;]+)/)?.[1] || "image/png";
      const buf = Buffer.from(base64Data, "base64");
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      return res.status(200).send(buf);
    }

    return res.status(404).end();
  } catch (e) {
    console.error("[user/profileImage]", e.message);
    return res.status(500).json({ error: e.message });
  }
}
