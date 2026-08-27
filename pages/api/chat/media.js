"use strict";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import * as constants from "@/lib/constants";
import * as r2 from "@/lib/r2Storage";
import { deploymentSystemCode } from "@/lib/tenantResolver";

export const config = { api: { responseLimit: false } };


export default async function handler(req, res) {
  // 테넌트는 서버가 요청으로부터 정한다.
  const SYSTEM_CODE = deploymentSystemCode();
  if (req.method !== "GET") return res.status(405).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing id" });

  try {
    const sql = await dynamicSql.getSQL(SYSTEM_CODE, "select_TB_COR_CHAT_FILE", 2);
    const result = await database.executeSQL(sql, [SYSTEM_CODE, id]);

    if (result.rowCount === 0) return res.status(404).end();

    const { mime_type, file_name, file_data, r2_key } = result.rows[0];

    // R2에 저장된 파일 — presigned URL로 리다이렉트
    if (r2_key) {
      const url = await r2.getPresignedUrl(r2_key);
      // 서명 창이 유지되는 동안은 같은 URL 이 나오므로 리다이렉트 자체를 캐시시켜
      // 재생·재조회 때마다 앱서버와 DB 를 다시 때리지 않게 한다.
      res.setHeader("Cache-Control", `private, max-age=${r2.getSignWindowRemainingSeconds()}`);
      return res.redirect(302, url);
    }

    // 기존 DB 저장 파일 — 직접 서빙 (하위 호환)
    const buf = file_data instanceof Buffer ? file_data : Buffer.from(file_data);
    const total = buf.length;

    const range = req.headers.range;
    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
      const start = parseInt(startStr, 10);
      const end = endStr ? Math.min(parseInt(endStr, 10), total - 1) : Math.min(start + 1024 * 1024 - 1, total - 1);
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": mime_type,
        "Cache-Control": "private, max-age=86400",
      });
      return res.end(buf.subarray(start, end + 1));
    }

    res.writeHead(200, {
      "Content-Type": mime_type,
      "Content-Length": total,
      "Accept-Ranges": "bytes",
      "Content-Disposition": `inline; filename="${encodeURIComponent(file_name || "file")}"`,
      "Cache-Control": "private, max-age=86400",
    });
    return res.end(buf);
  } catch (e) {
    console.error("[chat/media]", e.message);
    return res.status(500).json({ error: e.message });
  }
}
