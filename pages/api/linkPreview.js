// URL OG 태그 파싱 서버사이드 API
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const { url } = req.query;
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  // YouTube 처리 — fetch 없이 바로 반환
  const ytMatch = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  );
  if (ytMatch) {
    const videoId = ytMatch[1];
    return res.json({
      url,
      title: null,
      description: null,
      image: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      siteName: "YouTube",
      isYoutube: true,
      videoId,
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; BrunnerBot/1.0; +https://www.brunner.co.kr)",
        Accept: "text/html",
      },
    });
    clearTimeout(timeout);

    const html = await response.text();

    const getMeta = (prop) => {
      const m =
        html.match(
          new RegExp(
            `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
            "i",
          ),
        ) ||
        html.match(
          new RegExp(
            `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
            "i",
          ),
        );
      return m ? m[1] : null;
    };

    const title =
      getMeta("og:title") ||
      (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] ||
      null;
    const description =
      getMeta("og:description") || getMeta("description") || null;
    const image = getMeta("og:image") || null;
    const siteName =
      getMeta("og:site_name") || new URL(url).hostname.replace(/^www\./, "");

    return res.json({ url, title, description, image, siteName });
  } catch {
    return res.status(500).json({ error: "Failed to fetch" });
  }
}
