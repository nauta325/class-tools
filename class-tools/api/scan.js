// 외부지문 스캐너 API.
//
//   POST {images:[{media_type,data}]}  → 본문 · 문장별 해석 · 단어장
//
// ★ 사진은 **분석에만 쓰고 저장하지 않습니다.** 디스크에도, DB 에도 안 남깁니다.
// ★ 선생님만 — 비밀번호(TEACHER_PASS)로 잠급니다.
import { scanImages, scanConfigured } from "../lib/scan.js";
import { 선생님인가, 잠금설정됨 } from "../lib/auth.js";

// 사진 여러 장이라 본문이 큽니다. 브라우저가 먼저 줄여서 보내지만 넉넉히 둡니다.
export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST 로 보내주세요." });
  if (!선생님인가(req)) return res.status(401).json({ error: "선생님 비밀번호를 넣어주세요." });

  if (!scanConfigured()) {
    return res.status(400).json({
      error: "ANTHROPIC_API_KEY 가 없습니다. Vercel 환경변수에 넣고 Redeploy 하세요.",
    });
  }

  const images = Array.isArray(req.body?.images) ? req.body.images : [];
  if (!images.length) return res.status(400).json({ error: "사진이 없습니다." });
  if (images.length > 8) {
    return res.status(400).json({ error: "한 번에 8장까지입니다. 나눠서 올려주세요." });
  }
  for (const im of images) {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(String(im?.media_type || ""))) {
      return res.status(400).json({ error: "사진 형식이 아닙니다 (jpg·png 만)." });
    }
    if (!im?.data) return res.status(400).json({ error: "사진 내용이 비어 있습니다." });
  }

  try {
    const out = await scanImages(images);
    if (!out.passage) {
      return res.status(200).json({
        ...out,
        warn: "본문을 거의 못 읽었습니다. 더 밝은 곳에서 글자가 크게 나오게 다시 찍어보세요.",
      });
    }
    return res.status(200).json({ ...out, locked: 잠금설정됨() });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "알 수 없는 오류" });
  }
}
