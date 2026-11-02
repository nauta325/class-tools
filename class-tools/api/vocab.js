// 단어 시험지 사진 채점 API — 서버 전부가 이 파일 하나입니다.
//
// 선생님만 씁니다 (TEACHER_PASS). 학생은 이 화면을 안 봅니다 —
// 아이는 종이에 쓰고, 찍어 올리는 건 선생님입니다.
//
// ★ 사진은 **비공개 저장소**에. 볼 때만 짧은 주소를 새로 만듭니다.
// ★ 맞고 틀림은 `lib/vocab.js` 규칙이 정합니다. AI 에게는 **읽기**와
//   **「같은 뜻인가」**만 묻습니다 — 그래야 같은 답이 늘 같게 채점됩니다.

import { 선생님인가 } from "../lib/auth.js";
import {
  select, insert, update, dbConfigured, 사진올리기, 사진주소, 학생들,
} from "../lib/db.js";
import {
  문항채점, 짝찾기, 점수표기, 재시인가, 모아세기, 정답표읽기, 표기풀기,
} from "../lib/vocab.js";
import { 시험지읽기, 답지읽기, 뜻판정, aiConfigured } from "../lib/vocab-ai.js";

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

const 지금 = () => new Date().toISOString();
const 기준 = () => {
  const n = Number(process.env.RETEST_PERCENT);
  return Number.isFinite(n) && n >= 0 ? n : 15;
};

// 채점 한 판 — 읽은 것 + 정답표 → 문항별 판정
async function 채점하기(읽은것, 정답표, mode) {
  const items = [];
  const 물어볼것 = [];
  for (const it of 읽은것.items) {
    const row = 정답표 ? 짝찾기(정답표.items, it.printed) : null;
    // 뜻 쓰기: 정답은 「뜻들」 · 스펠 쓰기: 정답은 「낱말」
    const key = row ? (mode === "spell" ? row.word : row.meanings) : (mode === "spell" ? "" : []);
    const mark = 문항채점({ mode, key, written: it.written });
    const 보일정답 = row ? (mode === "spell" ? 표기풀기(row.word).join(" / ") : (row.meanings ?? []).join(", ")) : "";
    items.push({ no: it.no, printed: it.printed, written: it.written, key: 보일정답, mark });
    if (mark === "ask") 물어볼것.push({ no: it.no, word: it.printed, keys: row?.meanings ?? [], written: it.written });
  }

  // 글자가 다른 뜻만 **한 번에 모아서** AI 에게
  if (물어볼것.length) {
    const 답 = await 뜻판정(물어볼것);
    for (const it of items) {
      if (it.mark !== "ask") continue;
      const v = 답[it.no];
      it.mark = v === "ok" ? "ok" : v === "no" ? "no" : "q"; // 애매하면 ❓
    }
  }
  return items;
}

function 셈하고(items) {
  const c = 모아세기(items);
  return { total: c.total, wrong: c.wrong, score_text: 점수표기(c.wrong, c.total), 통계: c };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST 로 보내주세요." });
  if (!선생님인가(req)) return res.status(401).json({ error: "선생님 비밀번호를 넣어주세요." });
  if (!dbConfigured()) {
    return res.status(400).json({ error: "SUPABASE_URL / SUPABASE_SERVICE_KEY 가 없습니다. 넣고 Redeploy 하세요." });
  }

  const a = req.body?.action || "";
  try {
    // ── 거들기 ─────────────────────────────────────────
    if (a === "setup") {
      return res.status(200).json({
        students: await 학생들().catch(() => []),
        keys: (await select("vocab_keys", "select=id,book,day,mode,items&order=updated_at.desc&limit=200").catch(() => [])) ?? [],
        retestPercent: 기준(),
        ai: aiConfigured(),
      });
    }

    // ── 정답표 ─────────────────────────────────────────
    // ① 답지 사진 → 초안
    if (a === "key-read") {
      if (!aiConfigured()) return res.status(400).json({ error: "ANTHROPIC_API_KEY 가 없습니다." });
      const images = Array.isArray(req.body?.images) ? req.body.images : [];
      if (!images.length) return res.status(400).json({ error: "사진이 없습니다." });
      return res.status(200).json(await 답지읽기(images));
    }
    // ③ 엑셀 붙여넣기 → 초안
    if (a === "key-paste") {
      const items = 정답표읽기(req.body?.text);
      return res.status(200).json({
        items,
        help: items.length ? "" :
          "못 읽었습니다. 「단어 뜻」 을 한 줄에 하나씩 넣어주세요 — 「apple 사과」 「examine 살펴보다, 조사하다」",
      });
    }
    if (a === "key-save") {
      const book = String(req.body?.book ?? "").trim();
      const day = String(req.body?.day ?? "").trim();
      const mode = req.body?.mode === "spell" ? "spell" : "meaning";
      const items = (Array.isArray(req.body?.items) ? req.body.items : [])
        .map((it, i) => ({
          no: Number(it?.no) || i + 1,
          word: String(it?.word ?? "").trim(),
          meanings: (Array.isArray(it?.meanings) ? it.meanings : String(it?.meanings ?? "").split(/[,，/]/))
            .map((x) => String(x).trim()).filter(Boolean),
        }))
        .filter((it) => it.word);
      if (!book || !day) return res.status(400).json({ error: "교재 이름과 Day 를 넣어주세요." });
      if (!items.length) return res.status(400).json({ error: "단어가 없습니다." });
      const [기존] = await select("vocab_keys",
        `book=eq.${encodeURIComponent(book)}&day=eq.${encodeURIComponent(day)}&mode=eq.${mode}&select=id`);
      const row = 기존
        ? (await update("vocab_keys", `id=eq.${기존.id}`, { items, updated_at: 지금() }))[0]
        : (await insert("vocab_keys", { book, day, mode, items }))[0];
      return res.status(200).json({ ok: true, id: row.id, count: items.length });
    }
    if (a === "key-one") {
      const [row] = await select("vocab_keys", `id=eq.${String(req.body?.id ?? "")}&select=*`);
      return res.status(200).json({ key: row ?? null });
    }

    // ── 채점 ───────────────────────────────────────────
    if (a === "grade") {
      if (!aiConfigured()) return res.status(400).json({ error: "ANTHROPIC_API_KEY 가 없습니다." });
      const images = Array.isArray(req.body?.images) ? req.body.images : [];
      if (!images.length) return res.status(400).json({ error: "사진이 없습니다." });

      const 읽은것 = await 시험지읽기(images);
      // 머리글을 못 읽으면 선생님이 고른 것을 씁니다
      const book = String(req.body?.book ?? "").trim() || 읽은것.head.book;
      const day = String(req.body?.day ?? "").trim() || 읽은것.head.day;
      const mode = req.body?.mode === "spell" || req.body?.mode === "meaning"
        ? req.body.mode : 읽은것.head.mode;

      let 정답표 = null;
      if (book && day) {
        const [row] = await select("vocab_keys",
          `book=eq.${encodeURIComponent(book)}&day=eq.${encodeURIComponent(day)}&mode=eq.${mode}&select=*`);
        정답표 = row ?? null;
      }

      // ★ 스펠 쓰기는 정답표가 **꼭 있어야** 합니다 — 우리말만 인쇄돼 있어서
      //   정답 철자를 알 길이 없습니다. 없으면 정답표 만들기로 보냅니다.
      if (!정답표 && mode === "spell") {
        return res.status(200).json({
          needKey: true, head: { book, day, mode }, read: 읽은것,
          message: "스펠 쓰기는 정답표가 있어야 채점됩니다. 먼저 정답표를 만들어 주세요.",
        });
      }

      const items = await 채점하기(읽은것, 정답표, mode);
      const { total, wrong, score_text } = 셈하고(items);

      // 사진을 비공개 저장소에 (실패해도 채점 결과는 살립니다)
      let path = null;
      try {
        const sid = String(req.body?.studentId ?? "unknown").replace(/[^\w-]/g, "");
        path = `${new Date().toISOString().slice(0, 10)}/${sid}-${Date.now()}.jpg`;
        await 사진올리기(path, images[0].data, images[0].media_type);
      } catch (e) { path = null; }

      const [row] = await insert("vocab_scans", {
        key_id: 정답표?.id ?? null,
        student_id: String(req.body?.studentId ?? "") || null,
        name: String(req.body?.name ?? "") || null,
        image_path: path, book, day, mode, items, total, wrong, score_text,
        no_key: !정답표, graded_at: 지금(),
      });
      return res.status(200).json({
        id: row.id, items, total, wrong, score_text,
        noKey: !정답표, head: { book, day, mode },
        retest: 재시인가(wrong, total, 기준()),
        photo: await 사진주소(path),
      });
    }

    // ── 선생님 확인 ────────────────────────────────────
    if (a === "list") {
      const 날 = String(req.body?.date ?? "").trim();
      let q = "select=id,student_id,name,book,day,mode,total,wrong,score_text,status,no_key,created_at&order=created_at.desc&limit=200";
      if (날) q += `&created_at=gte.${날}T00:00:00&created_at=lt.${날}T23:59:59`;
      if (req.body?.onlyRetest) q += "&status=eq.retest";
      return res.status(200).json({ rows: (await select("vocab_scans", q)) ?? [], retestPercent: 기준() });
    }
    if (a === "one") {
      const [row] = await select("vocab_scans", `id=eq.${String(req.body?.id ?? "")}&select=*`);
      if (!row) return res.status(404).json({ error: "기록을 못 찾았습니다." });
      return res.status(200).json({
        scan: row,
        photo: await 사진주소(row.image_path),
        retest: 재시인가(row.wrong, row.total, 기준()),
      });
    }

    // ✅/❌ 손으로 고치기 → 점수 다시
    if (a === "fix") {
      const id = String(req.body?.id ?? "");
      const [row] = await select("vocab_scans", `id=eq.${id}&select=*`);
      if (!row) return res.status(404).json({ error: "기록을 못 찾았습니다." });
      const no = Number(req.body?.no);
      const mark = ["ok", "no", "q"].includes(req.body?.mark) ? req.body.mark : "ok";
      const items = (row.items ?? []).map((it) =>
        Number(it.no) === no ? { ...it, mark, fixed: true } : it);
      const { total, wrong, score_text } = 셈하고(items);
      await update("vocab_scans", `id=eq.${id}`, { items, total, wrong, score_text });

      // ★ 「이 뜻도 맞음」으로 고치면 **정답표에 더해** 다음부터는 바로 맞게 합니다
      let 더함 = null;
      if (mark === "ok" && row.mode === "meaning" && row.key_id && req.body?.addMeaning) {
        const 고친것 = (row.items ?? []).find((x) => Number(x.no) === no);
        const 쓴것 = String(고친것?.written ?? "").trim();
        const [k] = await select("vocab_keys", `id=eq.${row.key_id}&select=*`);
        if (k && 쓴것) {
          const items2 = (k.items ?? []).map((x) => {
            const 같나 = 표기풀기(x.word).some((w) => w.toLowerCase() === String(고친것.printed).trim().toLowerCase());
            if (!같나 || (x.meanings ?? []).includes(쓴것)) return x;
            더함 = 쓴것;
            return { ...x, meanings: [...(x.meanings ?? []), 쓴것] };
          });
          if (더함) await update("vocab_keys", `id=eq.${k.id}`, { items: items2, updated_at: 지금() });
        }
      }
      return res.status(200).json({ items, total, wrong, score_text, retest: 재시인가(wrong, total, 기준()), added: 더함 });
    }

    if (a === "confirm") {
      const id = String(req.body?.id ?? "");
      const status = req.body?.status === "retest" ? "retest" : "pass";
      await update("vocab_scans", `id=eq.${id}`, { status, confirmed_at: 지금() });
      return res.status(200).json({ ok: true, status });
    }

    return res.status(400).json({ error: "모르는 action 입니다." });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "알 수 없는 오류" });
  }
}
