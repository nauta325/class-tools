// 🎙 목소리 카드 강의 — 서버. 하는 일은 셋뿐입니다.
//
//   me      학생 로그인 (학생ID + 출결PIN) → 이름 + 지금까지 끝까지 들은 카드
//   heard   카드 하나를 **끝까지** 들었다 → 기록
//   teacher 선생님 화면 — 학생마다 단원별로 몇 장 들었나
//
// ★ 강의 내용(대본·판서·mp3)은 **파일**입니다 (lecture-data/ · lecture-audio/).
//   서버는 내용을 모릅니다 — 「누가 어느 카드를 들었나」만 봅니다.
//   그래서 강의를 고쳐도 아이들 진도가 안 날아갑니다.
//
// ★ 학생은 **자기 것만** 봅니다. 남의 진도를 보려면 선생님 비밀번호가 있어야 합니다.

import { 선생님인가 } from "../lib/auth.js";
import { select, insert, dbConfigured, 학생찾기, 학생들 } from "../lib/db.js";

const 단원이름 = (v) => String(v ?? "").trim().slice(0, 40);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST 로 보내주세요." });
  if (!dbConfigured()) {
    return res.status(400).json({
      error: "SUPABASE_URL / SUPABASE_SERVICE_KEY 가 없습니다. 넣고 Redeploy 하세요.",
    });
  }

  const a = req.body?.action || "";
  try {
    // ── 선생님 ────────────────────────────────────────
    if (a === "teacher") {
      if (!선생님인가(req)) return res.status(401).json({ error: "선생님 비밀번호를 넣어주세요." });
      const 명단 = await 학생들().catch(() => []);
      const rows = (await select("lecture_heard", "select=student_id,unit,card&limit=20000")) ?? [];
      // 학생 → 단원 → 들은 카드 수
      const 셈 = {};
      for (const r of rows) {
        const s = (셈[r.student_id] = 셈[r.student_id] || {});
        s[r.unit] = (s[r.unit] || 0) + 1;
      }
      return res.status(200).json({ students: 명단, counts: 셈 });
    }

    // ── 학생 ──────────────────────────────────────────
    const s = await 학생찾기(req.body?.studentId, req.body?.pin);
    if (!s) return res.status(401).json({ error: "학생번호나 비밀번호(출결PIN)가 다릅니다." });

    if (a === "me") {
      // ★ `student_id=eq.<본인>` 을 지우지 마세요 — 남의 진도가 보입니다.
      const rows = (await select(
        "lecture_heard",
        `student_id=eq.${encodeURIComponent(s.student_id)}&select=unit,card&limit=5000`
      )) ?? [];
      const 들은것 = {};
      for (const r of rows) (들은것[r.unit] = 들은것[r.unit] || []).push(r.card);
      for (const k of Object.keys(들은것)) 들은것[k] = [...new Set(들은것[k])].sort((x, y) => x - y);
      return res.status(200).json({ name: s.name, studentId: s.student_id, heard: 들은것 });
    }

    if (a === "heard") {
      const unit = 단원이름(req.body?.unit);
      const card = Number(req.body?.card);
      if (!unit || !Number.isInteger(card) || card < 1) {
        return res.status(400).json({ error: "단원과 카드 번호가 필요합니다." });
      }
      // 같은 카드를 또 들어도 그냥 넘어갑니다 (표에 unique 를 걸어 뒀습니다)
      await insert("lecture_heard", { student_id: s.student_id, unit, card },
        "return=minimal,resolution=ignore-duplicates");
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "모르는 action 입니다." });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "알 수 없는 오류" });
  }
}
