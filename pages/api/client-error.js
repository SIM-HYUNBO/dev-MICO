// 클라이언트 렌더 크래시 진단 수집(임시) — componentStack으로 원인 컴포넌트를 특정하기 위함.
// POST: 에러 1건 적재. GET: 최근 30건 조회(진단용). 서버 메모리 링버퍼(비영구).
const BUF = (globalThis.__clientErrors ||= []);
const MAX = 30;

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      BUF.push({
        at: new Date().toISOString(),
        message: String(b.message || "").slice(0, 300),
        componentStack: String(b.componentStack || "").slice(0, 1500),
        url: String(b.url || "").slice(0, 300),
        ua: String(req.headers["user-agent"] || "").slice(0, 200),
      });
      while (BUF.length > MAX) BUF.shift();
    } catch { /* ignore */ }
    return res.status(200).json({ ok: true });
  }
  if (req.method === "GET") {
    return res.status(200).json({ count: BUF.length, errors: BUF.slice(-30) });
  }
  return res.status(405).json({ ok: false });
}
