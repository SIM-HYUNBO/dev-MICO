"use strict";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const {
    phase = "unknown",
    roomId = "",
    title = "",
    hasFocusedClient = false,
    forceNotification = false,
    error = "",
  } = req.body || {};

  console.info(
    `[push receipt] phase=${phase} roomId=${roomId} title=${title} focused=${hasFocusedClient} force=${forceNotification} error=${error}`,
  );
  res.status(200).json({ ok: true });
}
