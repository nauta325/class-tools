// 시험지 자동 채점 API — 서버 전부가 이 파일 하나입니다.
//
// ★★ 채점은 **여기서만** 합니다. 정답은 학생 브라우저로 내려가지 않습니다. ★★
//   · open    → 문항 수·종류·배점만 (정답·모범답안·해설 없음)
//   · submit  → 서버가 채점해서 **틀린 번호만** 돌려줍니다
//   · retry   → 다시 푼 것을 받고, 그제야 정답·해설을 내려줍니다
//
// 선생님 것(save·list·result)은 TEACHER_PASS 로 잠급니다.

import { 선생님인가 } from "../lib/auth.js";
import { select, insert, update, 학생찾기, dbConfigured } from "../lib/db.js";
import {
  학생용시험지, 틀린번호, 다시맞힌번호, 점수내기, 정답읽기,
} from "../lib/grade.js";

const 지금 = () => new Date().toISOString();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST 로 보내주세요." });
  if (!dbConfigured()) {
    return res.status(400).json({
      error: "SUPABASE_URL / SUPABASE_SERVICE_KEY 가 없습니다. Vercel 환경변수에 넣고 Redeploy 하세요.",
    });
  }

  const a = req.body?.action || "";
  const 선생님 = () => 선생님인가(req);

  try {
    // ══════════ 선생님 ══════════

    // 정답 붙여넣기를 문항으로 나눠 **미리 보여줍니다** (저장 전에 확인하시라고)
    if (a === "parse") {
      if (!선생님()) return res.status(401).json({ error: "선생님 비밀번호를 넣어주세요." });
      const 답 = 정답읽기(req.body?.text);
      const 수 = Object.keys(답).length;
      return res.status(200).json({
        answers: 답,
        count: 수,
        // 하나도 못 읽었으면 **어떻게 적어야 하는지** 알려줍니다 — 그냥 0개라고 하면 막막합니다
        help: 수 ? "" :
          "정답을 못 읽었습니다. 이렇게 적어주세요 — 「1 ③ 2 ⑤ 3 ①,④」 " +
          "또는 한 줄에 하나씩 「1 3」 「2 5」, 또는 「1.3 2.5」",
      });
    }

    if (a === "save") {
      if (!선생님()) return res.status(401).json({ error: "선생님 비밀번호를 넣어주세요." });
      const title = String(req.body?.title ?? "").trim();
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!title) return res.status(400).json({ error: "시험지 이름을 적어주세요." });
      if (!items.length) return res.status(400).json({ error: "문항이 없습니다." });
      const 깨끗 = items.map((it, i) => ({
        no: Number(it?.no) || i + 1,
        kind: it?.kind === "essay" ? "essay" : "choice",
        answers: Array.isArray(it?.answers) ? it.answers.map(Number).filter(Boolean) : [],
        model: String(it?.model ?? "").trim(),
        why: String(it?.why ?? "").trim(),
        point: Number(it?.point) > 0 ? Number(it.point) : 1,
      }));
      const [row] = await insert("exams", { title, total: 깨끗.length, items: 깨끗 });
      return res.status(200).json({ ok: true, id: row.id });
    }

    if (a === "exams") {
      if (!선생님()) return res.status(401).json({ error: "선생님 비밀번호를 넣어주세요." });
      const rows = await select("exams", "select=id,title,total,created_at&order=created_at.desc&limit=50");
      return res.status(200).json({ exams: rows ?? [] });
    }

    // 결과 표 — 학생별 점수 · 자주 틀린 번호
    if (a === "result") {
      if (!선생님()) return res.status(401).json({ error: "선생님 비밀번호를 넣어주세요." });
      const id = String(req.body?.examId ?? "");
      const [exam] = await select("exams", `id=eq.${id}&select=id,title,total,items`);
      if (!exam) return res.status(404).json({ error: "시험지를 못 찾았습니다." });
      const tries = await select(
        "exam_tries",
        `exam_id=eq.${id}&select=student_id,name,wrong,fixed,score,max_score,stage,updated_at&order=updated_at.desc`
      );
      // 한 학생이 여러 번 봤으면 **가장 최근 것**을 보여줍니다 (지난 것도 DB 엔 남아 있습니다)
      const 최근 = new Map();
      for (const t of tries ?? []) if (!최근.has(t.student_id)) 최근.set(t.student_id, t);
      const 줄 = [...최근.values()];
      // 자주 틀린 번호 — 많이 틀린 순
      const 셈 = new Map();
      for (const t of 줄) for (const n of t.wrong ?? []) 셈.set(n, (셈.get(n) ?? 0) + 1);
      const 자주 = [...셈.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0])
        .map(([no, cnt]) => ({ no, cnt }));
      return res.status(200).json({ exam: { id: exam.id, title: exam.title, total: exam.total }, rows: 줄, often: 자주, people: 줄.length });
    }

    // 오답 프린트 — 한 학생이 틀린 문제만 (정답·해설 포함, 선생님용)
    if (a === "wrongsheet") {
      if (!선생님()) return res.status(401).json({ error: "선생님 비밀번호를 넣어주세요." });
      const id = String(req.body?.examId ?? "");
      const sid = String(req.body?.studentId ?? "");
      const [exam] = await select("exams", `id=eq.${id}&select=title,items`);
      const [t] = await select(
        "exam_tries",
        `exam_id=eq.${id}&student_id=eq.${encodeURIComponent(sid)}&select=name,first,second,self,wrong,fixed&order=updated_at.desc&limit=1`
      );
      if (!exam || !t) return res.status(404).json({ error: "기록을 못 찾았습니다." });
      const 집 = new Set(t.wrong ?? []);
      return res.status(200).json({
        title: exam.title, name: t.name, studentId: sid,
        items: (exam.items ?? []).filter((it) => 집.has(Number(it.no))).map((it) => ({
          ...it,
          mine: t.first?.[String(it.no)] ?? null,
          again: t.second?.[String(it.no)] ?? null,
        })),
        fixed: t.fixed ?? [],
      });
    }

    // ══════════ 학생 ══════════

    if (a === "login") {
      const s = await 학생찾기(req.body?.studentId, req.body?.pin);
      if (!s) return res.status(401).json({ error: "학생번호나 출결번호가 다릅니다." });
      const list = await select("exams", "select=id,title,total&order=created_at.desc&limit=20");
      return res.status(200).json({ student: s, exams: list ?? [] });
    }

    // 시험지 열기 — ★ 정답 없이 내려갑니다
    if (a === "open") {
      const s = await 학생찾기(req.body?.studentId, req.body?.pin);
      if (!s) return res.status(401).json({ error: "학생번호나 출결번호가 다릅니다." });
      const [exam] = await select("exams", `id=eq.${String(req.body?.examId ?? "")}&select=id,title,total,items`);
      if (!exam) return res.status(404).json({ error: "시험지를 못 찾았습니다." });
      return res.status(200).json({ exam: 학생용시험지(exam) });
    }

    // 제출 — ★ 서버가 채점하고 **틀린 번호만** 돌려줍니다
    if (a === "submit") {
      const s = await 학생찾기(req.body?.studentId, req.body?.pin);
      if (!s) return res.status(401).json({ error: "학생번호나 출결번호가 다릅니다." });
      const examId = String(req.body?.examId ?? "");
      const [exam] = await select("exams", `id=eq.${examId}&select=id,items`);
      if (!exam) return res.status(404).json({ error: "시험지를 못 찾았습니다." });

      const first = req.body?.answers && typeof req.body.answers === "object" ? req.body.answers : {};
      const wrong = 틀린번호(exam.items, first);
      // ★ 「처음부터 다시」 를 해도 지난 기록은 안 지웁니다 — 늘 **새 줄**을 만듭니다
      const [row] = await insert("exam_tries", {
        exam_id: examId, student_id: s.student_id, name: s.name,
        first, wrong, stage: wrong.length ? "retry" : "done", updated_at: 지금(),
      });
      return res.status(200).json({ tryId: row.id, wrong, stage: row.stage });
      // ⚠️ 여기서 정답을 같이 보내지 마세요. 다시 풀기가 의미 없어집니다.
    }

    // 다시 푼 것 — 그제야 정답·해설을 내려줍니다
    if (a === "retry") {
      const s = await 학생찾기(req.body?.studentId, req.body?.pin);
      if (!s) return res.status(401).json({ error: "학생번호나 출결번호가 다릅니다." });
      const tryId = String(req.body?.tryId ?? "");
      const [t] = await select("exam_tries", `id=eq.${tryId}&select=id,exam_id,student_id,first,wrong`);
      if (!t || t.student_id !== s.student_id) return res.status(404).json({ error: "기록을 못 찾았습니다." });
      const [exam] = await select("exams", `id=eq.${t.exam_id}&select=items`);

      const second = req.body?.answers && typeof req.body.answers === "object" ? req.body.answers : {};
      const fixed = 다시맞힌번호(exam.items, t.wrong, second);
      await update("exam_tries", `id=eq.${tryId}`, { second, fixed, stage: "done", updated_at: 지금() });

      // 이제 공개합니다 — 처음 답 · 다시 푼 답 · 정답 · 해설
      return res.status(200).json({
        fixed,
        items: (exam.items ?? []).map((it) => ({
          no: it.no, kind: it.kind, point: it.point,
          answers: it.answers, model: it.model, why: it.why,
          mine: t.first?.[String(it.no)] ?? null,
          again: second?.[String(it.no)] ?? null,
          wasWrong: (t.wrong ?? []).includes(Number(it.no)),
        })),
      });
    }

    // 서술형 자기채점 → 점수 확정
    if (a === "self") {
      const s = await 학생찾기(req.body?.studentId, req.body?.pin);
      if (!s) return res.status(401).json({ error: "학생번호나 출결번호가 다릅니다." });
      const tryId = String(req.body?.tryId ?? "");
      const [t] = await select("exam_tries", `id=eq.${tryId}&select=id,exam_id,student_id,first`);
      if (!t || t.student_id !== s.student_id) return res.status(404).json({ error: "기록을 못 찾았습니다." });
      const [exam] = await select("exams", `id=eq.${t.exam_id}&select=items`);
      const self = req.body?.self && typeof req.body.self === "object" ? req.body.self : {};
      const { score, max } = 점수내기(exam.items, t.first, self);
      await update("exam_tries", `id=eq.${tryId}`, {
        self, score, max_score: max, stage: "done", updated_at: 지금(),
      });
      return res.status(200).json({ score, max });
    }

    return res.status(400).json({ error: "모르는 action 입니다." });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "알 수 없는 오류" });
  }
}
