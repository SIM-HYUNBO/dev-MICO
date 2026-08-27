import { deploymentSystemCode } from "@/lib/tenantResolver";
import { loadResourceTextRows } from "@/lib/resourceTextServer";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ rows: [] });
  }

  try {
    const rows = await loadResourceTextRows(deploymentSystemCode());
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ rows });
  } catch (error) {
    console.error("[resource-text]", error.message);
    return res.status(200).json({ rows: [] });
  }
}
