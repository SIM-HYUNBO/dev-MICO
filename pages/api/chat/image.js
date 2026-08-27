"use strict";

import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import { decrypt } from "@/lib/chatEncryption";
import * as constants from "@/lib/constants";
import * as r2 from "@/lib/r2Storage";
import * as chatImageStorage from "@/lib/chatImageStorage";
import { deploymentSystemCode } from "@/lib/tenantResolver";


export default async function handler(req, res) {
  // 테넌트는 서버가 요청으로부터 정한다.
  const SYSTEM_CODE = deploymentSystemCode();
  if (req.method !== "GET") return res.status(405).end();

  const { msgId } = req.query;
  if (!msgId) return res.status(400).json({ error: "Missing msgId" });

  try {
    const sql = await dynamicSql.getSQL(SYSTEM_CODE, "select_TB_COR_CHAT_MSG_BY_ID", 1);
    const result = await database.executeSQL(sql, [SYSTEM_CODE, Number(msgId)]);

    if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });

    const raw = result.rows[0].message;
    const decrypted = decrypt(raw);

    // R2 로 옮긴 이미지 — 본문에는 참조만 있다. 서명 URL 로 넘긴다.
    if (chatImageStorage.isR2Image(decrypted)) {
      const url = await r2.getPresignedUrl(chatImageStorage.getR2Key(decrypted));
      res.setHeader("Cache-Control", `private, max-age=${r2.getSignWindowRemainingSeconds()}`);
      return res.redirect(302, url);
    }

    if (!decrypted?.startsWith("data:image/")) {
      return res.status(400).json({ error: "Not an image" });
    }

    const [header, base64Data] = decrypted.split(",");
    const mimeType = header.match(/data:([^;]+)/)?.[1] || "image/jpeg";
    const buffer = Buffer.from(base64Data, "base64");

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(buffer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
