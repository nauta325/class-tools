// 수업 자료 API — 이 파일 하나가 서버 전부입니다.
//
// 액션 (전부 POST):
//   {action:"passage", topic, level, grammar, length}  → 새 지문 + 단어 + 문제 + 해석
//   {action:"meanings", words:[{en,ko}]}               → 비어 있는 뜻만 채우기
//   {action:"status"}                                  → 키가 꽂혔는지 (연결 테스트)
//
// ⚠️ API 키는 서버(Vercel 환경변수)에서만 읽습니다. 브라우저로 내보내지 마세요.
//
// ★ **단어 시험지는 여기를 안 거칩니다.** 전부 브라우저에서 만듭니다 —
//   키가 없어도, 인터넷이 끊겨도 시험지는 나옵니다. 그게 매일 쓰는 기능이라서요.

import { makePassage, fillMeanings, claudeConfigured } from "../lib/claude.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST 로 보내주세요." });

  try {
    const action = req.body?.action || "";

    if (action === "status") {
      return res.status(200).json({
        claude: claudeConfigured(),
        detail: claudeConfigured()
          ? "ANTHROPIC_API_KEY 있음 — 지문 만들기가 됩니다"
          : "ANTHROPIC_API_KEY 없음 — 지문 만들기만 안 됩니다 (단어 시험지는 그대로 돼요)",
      });
    }

    if (action === "passage") {
      const { topic, level, grammar, length } = req.body || {};
      return res.status(200).json(await makePassage({ topic, level, grammar, length }));
    }

    if (action === "meanings") {
      const words = Array.isArray(req.body?.words) ? req.body.words : [];
      return res.status(200).json({ words: await fillMeanings(words) });
    }

    return res.status(400).json({ error: "모르는 action 입니다." });
  } catch (e) {
    // 날코드를 그대로 띄우면 손을 못 씁니다 — lib/claude.js 가 사람 말로 바꿔 둡니다.
    return res.status(500).json({ error: e?.message || "알 수 없는 오류" });
  }
}
