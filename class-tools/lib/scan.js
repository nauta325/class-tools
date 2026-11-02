// 외부지문 스캐너 — 종이 사진을 읽어 수업 자료로 바꿉니다.
//
// ★ 사진은 **분석에만 씁니다. 저장하지 않습니다.** 서버에 파일로 떨어뜨리지 마세요.
//   (저장 기능을 켤 때도 **글 결과만** 남깁니다 — 사진은 안 남깁니다)
//
// ★ 본문은 **사진에 찍힌 그대로**. 고치거나 지어내면 안 됩니다 —
//   선생님이 원본과 대조할 수 없게 되면 이 도구는 쓸 수가 없습니다.

const MODEL = "claude-sonnet-5";
const API = "https://api.anthropic.com/v1/messages";

export function scanConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function scanGuideline() {
  return [
    "당신은 한국 영어학원 선생님을 돕습니다. 종이 영어 지문 사진을 읽어 수업 자료를 만듭니다.",
    "",
    "★★★ 본문 규칙 — 제일 중요 ★★★",
    "· 사진에 **찍힌 그대로** 옮깁니다. 고치거나 다듬거나 지어내지 마세요.",
    "· 흐려서 **안 보이는 글자는 [?]** 로 두세요. 짐작해서 채우지 마세요.",
    "· **문제 번호·보기(①②③)·밑줄 표시·네모 칸은 본문에서 뺍니다.** 지문 글만.",
    "· 사진이 여러 장이면 **순서대로 이어 붙입니다.** 같은 문장을 두 번 쓰지 마세요.",
    "· 머리말·꼬리말·쪽번호·학교 도장 같은 것은 본문에 넣지 마세요.",
    "",
    "같이 만드는 것",
    "· sentences — 본문을 **문장 단위로** 끊고 한국어 해석을 답니다.",
    "  해석은 직역이 아니라 **중학생이 읽어서 이해되는 우리말**로.",
    "· vocabulary — **중학생이 모를 만한** 낱말 15~25개.",
    "  word 는 **본문에 나온 형태 그대로**, example 은 **본문에서 그대로 가져온 문장**.",
    "  영영풀이는 쉬운 영어로 한 줄. 동의어·반의어는 없으면 빈 배열.",
    "· school·grade·title·source 는 **사진에 적혀 있을 때만** 채우고, 없으면 빈 문자열.",
    "  (지어내지 마세요 — 「○○중학교」 같은 걸 상상해서 넣으면 안 됩니다)",
    "",
    "출력은 **JSON 하나만**. 설명·인사말·```json 없이 { 로 시작합니다.",
  ].join("\n");
}

const SHAPE = `{
  "school": "", "grade": "", "title": "", "source": "",
  "passage": "본문 전체. 문단 사이는 \\n\\n",
  "sentences": [{"en":"영어 문장","ko":"한국어 해석"}],
  "vocabulary": [{"word":"낱말","meaning_ko":"뜻","eng_definition":"easy English definition","synonyms":[],"antonyms":[],"example":"본문 속 문장"}]
}`;

export function parseJson(raw) {
  let s = String(raw ?? "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}

// 빠진 칸이 있어도 화면이 안 깨지게.
export function normalizeScan(d) {
  const o = d && typeof d === "object" ? d : {};
  const str = (v) => String(v ?? "").trim();
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    school: str(o.school),
    grade: str(o.grade),
    title: str(o.title),
    source: str(o.source),
    passage: str(o.passage),
    sentences: arr(o.sentences)
      .map((s) => ({ en: str(s?.en), ko: str(s?.ko) }))
      .filter((s) => s.en),
    vocabulary: arr(o.vocabulary)
      .map((w) => ({
        word: str(w?.word),
        meaning_ko: str(w?.meaning_ko),
        eng_definition: str(w?.eng_definition),
        // 문자열 하나로 와도 받아줍니다 (모델이 가끔 그럽니다)
        synonyms: (Array.isArray(w?.synonyms) ? w.synonyms : str(w?.synonyms).split(/,\s*/))
          .map(str).filter(Boolean),
        antonyms: (Array.isArray(w?.antonyms) ? w.antonyms : str(w?.antonyms).split(/,\s*/))
          .map(str).filter(Boolean),
        example: str(w?.example),
      }))
      .filter((w) => w.word),
  };
}

// images: [{ media_type, data(base64) }]
async function 물어보기(images, 덧붙일말 = "") {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY 가 없습니다. Vercel 환경변수에 넣고 Redeploy 하세요.");

  const content = [
    ...images.map((im) => ({
      type: "image",
      source: { type: "base64", media_type: im.media_type, data: im.data },
    })),
    {
      type: "text",
      text: [
        `사진 ${images.length}장입니다. 순서대로 이어진 하나의 지문으로 보세요.`,
        덧붙일말,
        "",
        "아래 모양 그대로 JSON 하나만:",
        SHAPE,
      ].filter(Boolean).join("\n"),
    },
  ];

  const r = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system: scanGuideline(),
      messages: [{ role: "user", content }],
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    if (r.status === 401) throw new Error("Claude 키가 틀렸습니다. ANTHROPIC_API_KEY 를 확인하세요.");
    if (r.status === 429) throw new Error("Claude 가 바쁩니다. 잠시 뒤 다시 눌러주세요.");
    if (r.status === 413) throw new Error("사진이 너무 큽니다. 몇 장 빼고 나눠서 올려주세요.");
    if (/credit|billing/i.test(t))
      throw new Error("Claude 크레딧이 없습니다. console.anthropic.com → Billing 에서 충전하세요.");
    throw new Error(`Claude 오류 ${r.status}: ${t.slice(0, 200)}`);
  }
  const d = await r.json();
  return (d?.content ?? []).map((c) => c.text || "").join("").trim();
}

export async function scanImages(images) {
  if (!images?.length) throw new Error("사진이 없습니다.");
  let raw = await 물어보기(images);
  try {
    return normalizeScan(parseJson(raw));
  } catch {
    // ★ JSON 이 깨져서 오면 **한 번만** 더 물어봅니다 (사양서대로).
    //   두 번 다 실패하면 이유를 화면에 보여줍니다 — 조용히 빈 화면을 띄우지 않습니다.
    raw = await 물어보기(images, "⚠️ 앞서 받은 답이 JSON 으로 읽히지 않았습니다. **JSON 하나만** 다시 주세요.");
    try {
      return normalizeScan(parseJson(raw));
    } catch (e) {
      throw new Error(
        "결과를 읽지 못했습니다 (JSON 이 두 번 다 깨졌습니다). " +
          "사진을 더 또렷하게 찍거나 장수를 줄여서 다시 해보세요. " +
          `— ${String(e.message).slice(0, 80)}`
      );
    }
  }
}
