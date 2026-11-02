// 단어 시험지 사진을 **읽는** 부분 (채점 규칙은 lib/vocab.js).
//
// 하는 일 세 가지
//   ① 학생 시험지 읽기 — 머리글 + 문항마다 「인쇄된 낱말 · 학생이 쓴 답」
//   ② 답지 읽기        — 정답표 초안 만들기
//   ③ 뜻이 같은지 판정 — 글자가 달라도 같은 뜻인지만 (lib/vocab.js 가 "ask" 를 줄 때)
//
// ★ 학생 글씨는 **쓴 그대로** 읽습니다. 철자를 짐작해 고치면 틀린 아이가 맞게 됩니다.
// ★ 읽기와 채점을 **분리**했습니다. AI 에게 「맞았는지」를 묻지 않습니다 —
//   맞고 틀림은 우리 규칙(lib/vocab.js)이 정합니다. 그래야 같은 답이 늘 같게 채점됩니다.

const MODEL = "claude-sonnet-5";
const API = "https://api.anthropic.com/v1/messages";

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function 부르기(system, content, maxTokens = 4000) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY 가 없습니다. Vercel 환경변수에 넣고 Redeploy 하세요.");
  const r = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content }] }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    if (r.status === 401) throw new Error("Claude 키가 틀렸습니다. ANTHROPIC_API_KEY 를 확인하세요.");
    if (r.status === 429) throw new Error("Claude 가 바쁩니다. 잠시 뒤 다시 눌러주세요.");
    if (/credit|billing/i.test(t))
      throw new Error("Claude 크레딧이 없습니다. console.anthropic.com → Billing 에서 충전하세요.");
    throw new Error(`Claude 오류 ${r.status}: ${t.slice(0, 200)}`);
  }
  const d = await r.json();
  return (d?.content ?? []).map((c) => c.text || "").join("").trim();
}

export function parseJson(raw) {
  let s = String(raw ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}

const 이미지 = (im) => ({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } });

// ── ① 학생 시험지 읽기 ───────────────────────────────────
const 읽기지침 = [
  "당신은 한국 영어학원 선생님을 돕습니다. **단어 시험지 사진**을 읽습니다.",
  "",
  "★★★ 제일 중요 ★★★",
  "· 학생이 손으로 쓴 답은 **쓴 그대로** 옮깁니다.",
  "  철자를 고치거나 짐작해서 채우지 마세요. 틀리게 쓴 것도 **틀린 그대로** 옮깁니다.",
  "  (여기서 고쳐 주면 선생님이 아이의 실수를 영영 못 봅니다)",
  "· 글자를 확실히 못 읽겠으면 그 자리에 **[?]** 를 넣으세요. 비슷한 낱말로 바꾸지 마세요.",
  "· 아무것도 안 썼으면 written 을 **빈 문자열**로 두세요.",
  "· printed 는 **시험지에 인쇄된** 낱말(또는 우리말)입니다 — 학생 글씨가 아닙니다.",
  "",
  "머리글(head)",
  "· 맨 위에서 **교재 이름 · Day(유닛) · 뜻쓰기/스펠쓰기**를 찾습니다.",
  "· 없으면 빈 문자열로 두세요. **지어내지 마세요.**",
  "· mode 는 영어가 인쇄돼 있으면 'meaning'(뜻 쓰기), 우리말이 인쇄돼 있으면 'spell'(스펠 쓰기).",
  "",
  "출력은 **JSON 하나만**. 설명 없이 { 로 시작합니다.",
].join("\n");

const 읽기모양 = `{
  "head": {"book":"", "day":"", "mode":"meaning"},
  "items": [{"no":1, "printed":"인쇄된 낱말", "written":"학생이 쓴 그대로"}]
}`;

export function normalizeRead(d) {
  const o = d && typeof d === "object" ? d : {};
  const s = (v) => String(v ?? "").trim();
  const h = o.head && typeof o.head === "object" ? o.head : {};
  return {
    head: { book: s(h.book), day: s(h.day), mode: h.mode === "spell" ? "spell" : "meaning" },
    items: (Array.isArray(o.items) ? o.items : [])
      .map((it, i) => ({ no: Number(it?.no) || i + 1, printed: s(it?.printed), written: s(it?.written) }))
      .filter((it) => it.printed),
  };
}

export async function 시험지읽기(images) {
  const content = [...images.map(이미지), { type: "text", text: `이 시험지를 읽어주세요.\n\n${읽기모양}` }];
  let raw = await 부르기(읽기지침, content);
  try { return normalizeRead(parseJson(raw)); }
  catch {
    // JSON 이 깨지면 한 번만 더 — 두 번 다 실패하면 이유를 보여줍니다
    raw = await 부르기(읽기지침, [...content, { type: "text", text: "⚠️ JSON 으로 안 읽혔습니다. **JSON 하나만** 다시 주세요." }]);
    try { return normalizeRead(parseJson(raw)); }
    catch (e) {
      throw new Error(`시험지를 못 읽었습니다. 더 밝은 곳에서 글자가 크게 나오게 다시 찍어보세요. — ${String(e.message).slice(0, 60)}`);
    }
  }
}

// ── ② 답지 읽기 → 정답표 초안 ────────────────────────────
const 답지지침 = [
  "한국 영어학원의 **단어 답지**를 읽습니다. 문항마다 「영어 낱말 — 우리말 뜻」을 옮깁니다.",
  "· 뜻이 여럿이면 meanings 에 **나눠서** 담습니다 (「살펴보다, 조사하다」 → 두 개).",
  "· 교재 표기(come[be] from · judg(e)ment)는 **그대로** 두세요. 펴지 마세요.",
  "· 안 보이는 글자는 [?] 로. 지어내지 마세요.",
  "· 머리글에서 교재·Day·뜻쓰기/스펠쓰기를 찾되, 없으면 빈 문자열.",
  "출력은 **JSON 하나만**.",
].join("\n");

const 답지모양 = `{
  "head": {"book":"", "day":"", "mode":"meaning"},
  "items": [{"no":1, "word":"영어 낱말", "meanings":["뜻1","뜻2"]}]
}`;

export function normalizeKey(d) {
  const o = d && typeof d === "object" ? d : {};
  const s = (v) => String(v ?? "").trim();
  const h = o.head && typeof o.head === "object" ? o.head : {};
  return {
    head: { book: s(h.book), day: s(h.day), mode: h.mode === "spell" ? "spell" : "meaning" },
    items: (Array.isArray(o.items) ? o.items : [])
      .map((it, i) => ({
        no: Number(it?.no) || i + 1,
        word: s(it?.word),
        meanings: (Array.isArray(it?.meanings) ? it.meanings : s(it?.meanings).split(/[,，/]/))
          .map(s).filter(Boolean),
      }))
      .filter((it) => it.word && it.meanings.length),
  };
}

export async function 답지읽기(images) {
  const content = [...images.map(이미지), { type: "text", text: `이 답지를 읽어주세요.\n\n${답지모양}` }];
  const raw = await 부르기(답지지침, content);
  try { return normalizeKey(parseJson(raw)); }
  catch (e) {
    throw new Error(`답지를 못 읽었습니다. 다시 찍어보시거나 엑셀로 붙여넣어 주세요. — ${String(e.message).slice(0, 60)}`);
  }
}

// ── ③ 「같은 뜻인가」만 판정 ──────────────────────────────
// 글자가 달라도 같은 뜻이면 맞게 쳐줘야 합니다 (「조사하다」 vs 「알아보다」).
// ★ **한 번에 모아서** 묻습니다 — 문항마다 부르면 20문항에 20번을 부릅니다.
// ★ 맞고 틀림을 AI 가 정하는 게 아니라, **「같은 뜻인가」만** 묻습니다.
const 뜻지침 = [
  "영어 낱말의 뜻을 학생이 우리말로 썼습니다. **등록된 뜻과 같은 뜻인지**만 판정합니다.",
  "· 표현이 달라도 **뜻이 통하면 같은 뜻**입니다 (조사하다 ↔ 알아보다 ↔ 살펴보다).",
  "· 품사가 달라도 뜻이 맞으면 같은 뜻으로 봅니다 (조사 ↔ 조사하다).",
  "· **너무 넓으면 아닙니다** — 「보다」 하나로 examine 을 맞다고 하지 마세요.",
  "· 애매하면 \"ask\" 로 두세요. 선생님이 봅니다. **억지로 맞다고 하지 마세요.**",
  '출력은 JSON 하나: {"결과":{"1":"ok"|"no"|"ask", "2":...}}  (번호는 문항 번호)',
].join("\n");

export async function 뜻판정(묶음) {
  // 묶음: [{no, word, keys:[뜻...], written}]
  if (!묶음?.length) return {};
  const 글 = 묶음.map((x) =>
    `${x.no}. 낱말: ${x.word} / 등록된 뜻: ${x.keys.join(" · ")} / 학생이 쓴 것: ${x.written}`
  ).join("\n");
  try {
    const raw = await 부르기(뜻지침, [{ type: "text", text: 글 }], 1500);
    const d = parseJson(raw)?.결과 ?? {};
    const out = {};
    for (const x of 묶음) {
      const v = String(d[String(x.no)] ?? "").trim();
      out[x.no] = v === "ok" ? "ok" : v === "no" ? "no" : "ask";
    }
    return out;
  } catch {
    // ★ 실패하면 **전부 ❓** 로 둡니다. 「틀림」으로 밀어버리면 아이가 억울합니다.
    const out = {};
    for (const x of 묶음) out[x.no] = "ask";
    return out;
  }
}
