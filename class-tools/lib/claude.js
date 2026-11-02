// Claude(Anthropic) — 수업 자료를 만들어 주는 부분.
//
// 두 가지를 합니다:
//   ① 지문 만들기  — 주제·레벨·문법 포인트를 받아 **새 지문**을 씁니다 (저작권 0)
//   ② 단어 뜻 채우기 — 영어 낱말만 적어 넣었을 때 뜻을 채워 줍니다
//
// ★ 이 파일의 핵심은 프롬프트입니다. 자료 느낌을 바꾸고 싶으면 여기만 고치면 돼요.
//   클로드에게: "지문 말투를 더 쉽게" / "문제를 5개까지 만들어줘"

const MODEL = "claude-sonnet-5"; // 품질↑ "claude-opus-5" / 저렴·빠름 "claude-haiku-5-5"
const API = "https://api.anthropic.com/v1/messages";

export function claudeConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// ── 레벨 — 학년 말고 **문장 길이·어휘 수**로 잡습니다 ──────────────
// 「중2」라고만 하면 모델마다 생각하는 게 달라 길이가 들쭉날쭉합니다.
// 숫자로 못 박아야 매번 비슷한 것이 나옵니다.
export const LEVELS = {
  "초등 고학년": { words: "70~90", sentence: "8~12", note: "현재·과거시제 위주, 관계사·분사 피하기" },
  "중1": { words: "90~110", sentence: "10~14", note: "기본 시제·조동사까지" },
  "중2": { words: "110~140", sentence: "12~16", note: "to부정사·동명사·비교급까지" },
  "중3": { words: "140~170", sentence: "14~18", note: "관계대명사·분사·수동태까지" },
  "고1": { words: "170~200", sentence: "16~22", note: "가정법·분사구문까지" },
  "고2~3": { words: "200~250", sentence: "18~26", note: "모의고사 어휘 수준" },
};

export function passageGuideline() {
  return [
    "당신은 한국 영어학원 선생님입니다. 학생이 읽을 **새 지문**을 씁니다.",
    "",
    "★★★ 가장 중요 ★★★",
    "· 기존 교재·모의고사·교과서 지문을 **베끼거나 비슷하게 바꾸지 마세요.**",
    "  처음부터 **새로 쓰는 글**입니다. 실제로 있는 지문이 떠올라도 쓰지 마세요.",
    "· 사실을 지어내도 되지만, **틀린 상식을 사실처럼 쓰지 마세요.**",
    "  확실하지 않으면 특정 숫자·연도·인명을 피하고 일반적인 내용으로 쓰세요.",
    "",
    "지문 규칙",
    "· 한 편으로 완결되게. 앞뒤 맥락이 없어도 읽힙니다.",
    "· 문단은 1~3개. 주제문이 분명하게.",
    "· 지정된 문법 포인트가 **자연스럽게 3번 이상** 나오게 합니다 (억지로 끼워넣지 말 것).",
    "· 한국 중고생이 흥미를 느낄 소재로. 너무 미국 문화에 기대지 마세요.",
    "",
    "같이 만드는 것",
    "· words  — 이 지문에서 **학생이 모를 만한** 낱말 8~12개. 지문에 나온 형태 그대로.",
    "· quiz   — 내용 이해 문제 3개. 객관식(보기 4개)으로, 답은 0부터 센 번호.",
    "· trans  — 한글 해석. 직역이 아니라 **읽히는 한국어**로.",
    "",
    "출력은 **JSON 하나만**. 설명·인사말·```json 같은 것 없이 { 로 시작합니다.",
  ].join("\n");
}

const SHAPE = `{
  "title": "영어 제목",
  "passage": "지문 전체. 문단 사이는 \\n\\n",
  "words": [{"en":"낱말","ko":"뜻"}],
  "quiz": [{"q":"문제","choices":["①내용","②내용","③내용","④내용"],"answer":0,"why":"근거 한 줄"}],
  "trans": "한글 해석"
}`;

async function ask(system, user, maxTokens = 3000) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY 가 없습니다. Vercel 환경변수에 넣고 Redeploy 하세요.");

  const r = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    // 흔한 것은 사람 말로 바꿔 줍니다 — 영어 원문만 띄우면 손을 못 씁니다.
    if (r.status === 401) throw new Error("Claude 키가 틀렸습니다. ANTHROPIC_API_KEY 를 다시 확인하세요.");
    if (r.status === 429) throw new Error("Claude 가 바쁩니다. 잠시 뒤 다시 눌러주세요.");
    if (/credit|billing/i.test(t))
      throw new Error("Claude 크레딧이 없습니다. console.anthropic.com 의 Billing 에서 충전하세요.");
    throw new Error(`Claude 오류 ${r.status}: ${t.slice(0, 200)}`);
  }
  const d = await r.json();
  return (d?.content ?? []).map((c) => c.text || "").join("").trim();
}

// 모델이 ```json 으로 감싸거나 앞뒤에 말을 붙여도 건져냅니다.
export function parseJson(raw) {
  let s = String(raw ?? "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}

// 빠진 칸이 있어도 화면이 깨지지 않게 모양을 맞춥니다.
export function normalizePassage(d) {
  const o = d && typeof d === "object" ? d : {};
  const words = Array.isArray(o.words) ? o.words : [];
  const quiz = Array.isArray(o.quiz) ? o.quiz : [];
  return {
    title: String(o.title ?? "").trim(),
    passage: String(o.passage ?? "").trim(),
    trans: String(o.trans ?? "").trim(),
    words: words
      .map((w) => ({ en: String(w?.en ?? "").trim(), ko: String(w?.ko ?? "").trim() }))
      .filter((w) => w.en),
    quiz: quiz
      .map((q) => ({
        q: String(q?.q ?? "").trim(),
        choices: (Array.isArray(q?.choices) ? q.choices : []).map((c) => String(c ?? "").trim()),
        // 범위를 벗어난 답이 오면 0 으로 — 정답지에 빈칸이 뜨는 것보다 낫습니다.
        answer: Number.isInteger(q?.answer) && q.answer >= 0 && q.answer < (q?.choices?.length ?? 0)
          ? q.answer
          : 0,
        why: String(q?.why ?? "").trim(),
      }))
      .filter((q) => q.q && q.choices.length >= 2),
  };
}

export async function makePassage({ topic, level, grammar, length }) {
  const L = LEVELS[level] || LEVELS["중2"];
  const user = [
    `주제: ${topic || "자유 (학생이 흥미를 느낄 만한 것)"}`,
    `레벨: ${level || "중2"} — 전체 ${length || L.words} 낱말, 한 문장 ${L.sentence} 낱말 안팎`,
    `그 레벨에서 쓰는 문법: ${L.note}`,
    `꼭 들어갈 문법 포인트: ${grammar || "지정 없음 (주제에 맞게 자연스럽게)"}`,
    "",
    "아래 모양 그대로 JSON 하나만:",
    SHAPE,
  ].join("\n");
  return normalizePassage(parseJson(await ask(passageGuideline(), user, 3000)));
}

// ── 단어 뜻 채우기 ────────────────────────────────────────
// 영어만 적어 넣으면 뜻을 채워 줍니다. **이미 적은 뜻은 건드리지 않습니다.**
export async function fillMeanings(words) {
  const 빈것 = words.filter((w) => w.en && !w.ko).map((w) => w.en);
  if (!빈것.length) return words;
  const system = [
    "한국 영어학원 선생님입니다. 영어 낱말의 뜻을 **중고생이 외울 수 있게 짧게** 답니다.",
    "· 품사가 여럿이면 가장 많이 쓰는 뜻 하나만.",
    "· 「~하다」 「~한」 처럼 품사가 드러나게.",
    "· 설명하지 말고 뜻만. 길어야 8글자.",
    '출력은 JSON 하나: {"뜻":{"word":"뜻", ...}}',
  ].join("\n");
  const raw = await ask(system, 빈것.join("\n"), 1500);
  let map = {};
  try {
    map = parseJson(raw)?.뜻 ?? {};
  } catch {
    return words; // 못 채워도 시험지는 나와야 합니다
  }
  return words.map((w) => (w.ko ? w : { ...w, ko: String(map[w.en] ?? "").trim() }));
}
