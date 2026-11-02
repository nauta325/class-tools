// 단어 시험지 사진 채점 — 맞았는지 틀렸는지 **판단하는 규칙**만 모았습니다.
//
// DB 도 AI 도 없습니다. 그래야 점검을 돌릴 수 있고, 규칙이 조용히 바뀌는 걸 막습니다.
// ★ 채점이 틀리면 **아이가 억울합니다.** 여기가 이 기능에서 제일 중요한 파일입니다.

// ── 표기 두 가지 풀기 ────────────────────────────────────
// 교재가 이렇게 적습니다:
//   come[be] from  → come from · be from   (대괄호 = 앞 낱말을 **갈아끼움**)
//   judg(e)ment    → judgment · judgement  (괄호 = 있어도 되고 없어도 됨)
// 둘 다 정답으로 쳐야 합니다. 안 그러면 맞게 쓴 아이가 틀립니다.
export function 표기풀기(raw) {
  let 들 = [String(raw ?? "").trim()];
  if (!들[0]) return [];

  // (e) — 있는 것 · 없는 것
  for (let i = 0; i < 6; i++) {
    const 다음 = [];
    let 바뀜 = false;
    for (const s of 들) {
      const m = /\(([^()]*)\)/.exec(s);
      if (!m) { 다음.push(s); continue; }
      바뀜 = true;
      다음.push(s.slice(0, m.index) + m[1] + s.slice(m.index + m[0].length));
      다음.push(s.slice(0, m.index) + s.slice(m.index + m[0].length));
    }
    들 = 다음;
    if (!바뀜) break;
  }

  // come[be] from — 대괄호 **앞의 한 낱말**을 대괄호 안의 것으로 갈아끼웁니다
  for (let i = 0; i < 6; i++) {
    const 다음 = [];
    let 바뀜 = false;
    for (const s of 들) {
      const m = /(\S*?)\[([^\[\]]*)\]/.exec(s);
      if (!m) { 다음.push(s); continue; }
      바뀜 = true;
      const 앞 = s.slice(0, m.index);
      const 뒤 = s.slice(m.index + m[0].length);
      다음.push(앞 + m[1] + 뒤);   // come from
      다음.push(앞 + m[2] + 뒤);   // be from
    }
    들 = 다음;
    if (!바뀜) break;
  }

  return [...new Set(들.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

// 철자 비교용으로 다듬기 — 대소문자·앞뒤 공백·여러 칸을 무시합니다.
// ⚠️ 그 이상은 건드리지 않습니다. 「-」 나 「'」 를 지우면 well-known 과 wellknown 이
//    같아져서, 틀리게 쓴 아이가 맞게 됩니다.
export const 다듬기 = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// ── 스펠 쓰기 채점 ───────────────────────────────────────
// 우리말이 인쇄되고 학생이 **영어 철자**를 씁니다. 정확해야 맞습니다.
export function 철자맞나(정답, 쓴것) {
  const 쓴 = 다듬기(쓴것);
  if (!쓴) return "blank";
  const 후보 = 표기풀기(정답).map(다듬기);
  if (!후보.length) return "nokey";
  return 후보.includes(쓴) ? "ok" : "no";
}

// ── 뜻 쓰기 채점 ─────────────────────────────────────────
// 영어가 인쇄되고 학생이 **우리말 뜻**을 씁니다.
// 등록된 뜻(쉼표로 여러 개) 가운데 하나와 **글자가 같으면 바로 맞음**.
// 다르면 여기서 판단하지 않고 "ask" 를 돌려줍니다 — AI 에게 「같은 뜻인지」만 묻습니다.
//
// ⚠️ 한국어는 「조사·어미」가 붙습니다 — 「조사하다」 / 「조사한다」 / 「조사」.
//    글자 비교만 하면 멀쩡한 답이 다 틀립니다. 그래서 **끝을 조금 다듬어** 봅니다.
const 꼬리 = ["하다", "한다", "합니다", "하는", "함", "되다", "된다", "되는", "임", "이다", "다"];
function 뿌리(s) {
  let t = 다듬기(s).replace(/[.,·…~!?]/g, "").replace(/\s+/g, "");
  for (const k of 꼬리) if (t.length > k.length + 1 && t.endsWith(k)) return t.slice(0, -k.length);
  return t;
}

export function 뜻맞나(정답뜻들, 쓴것) {
  const 쓴 = 다듬기(쓴것);
  if (!쓴) return "blank";
  const 들 = (Array.isArray(정답뜻들) ? 정답뜻들 : String(정답뜻들 ?? "").split(/[,，/]/))
    .map((x) => String(x).trim()).filter(Boolean);
  if (!들.length) return "nokey";
  if (들.some((d) => 다듬기(d) === 쓴)) return "ok";
  // 조사·어미만 다른 경우까지는 여기서 맞춰 줍니다 (AI 를 덜 부르려고)
  const 쓴뿌리 = 뿌리(쓴);
  if (쓴뿌리 && 들.some((d) => 뿌리(d) === 쓴뿌리)) return "ok";
  return "ask"; // ← AI 에게 「같은 뜻인가」만 물어봅니다
}

// ── 한 문항 채점 ─────────────────────────────────────────
// written 에 [?] 가 있으면 **사람이 봐야 합니다** — 짐작해서 맞다고 하면 안 됩니다.
export function 문항채점({ mode, key, written }) {
  if (String(written ?? "").includes("[?]")) return "q";
  const r = mode === "spell" ? 철자맞나(key, written) : 뜻맞나(key, written);
  if (r === "blank") return "blank";
  if (r === "nokey") return "q";
  return r; // ok · no · ask
}

// ── 점수 ────────────────────────────────────────────────
// 「-3/20」 처럼 적습니다. 다 맞으면 100.
// ❓(사람이 봐야 하는 것)는 **틀린 것으로 세지 않습니다** — 확정 전이니까요.
export function 점수표기(틀린수, 총수) {
  if (!총수) return "";
  return 틀린수 === 0 ? "100" : `-${틀린수}/${총수}`;
}

export function 재시인가(틀린수, 총수, 기준퍼센트 = 15) {
  if (!총수) return false;
  const p = Number(기준퍼센트);
  const 기준 = Number.isFinite(p) && p >= 0 ? p : 15;
  // 「틀린 수가 15%를 **넘으면**」 재시. 20문항이면 3개까지 통과, 4개부터 재시.
  return 틀린수 > (총수 * 기준) / 100;
}

export function 모아세기(items) {
  let ok = 0, no = 0, q = 0, blank = 0, ask = 0;
  for (const it of items ?? []) {
    const m = it?.mark;
    if (m === "ok") ok++;
    else if (m === "q") q++;
    else if (m === "ask") ask++;
    else if (m === "blank") { no++; blank++; }
    else no++;
  }
  return { total: (items ?? []).length, ok, wrong: no, question: q, ask, blank };
}

// ── 붙여넣기로 정답표 만들기 ──────────────────────────────
// 「단어, 뜻」 — 엑셀·구글시트에서 그대로 복사해 옵니다.
// 뜻이 여러 개면 「살펴보다, 조사하다」 처럼 쉼표로 이어 적습니다.
// ⚠️ 그래서 **첫 쉼표(또는 탭)까지가 단어**이고 나머지가 전부 뜻입니다.
//    쉼표로 다 쪼개면 「살펴보다」만 뜻이 되고 「조사하다」가 단어가 됩니다.
export function 정답표읽기(text) {
  const out = [];
  for (let line of String(text ?? "").split("\n")) {
    line = line.trim().replace(/^\s*\d+[.)]\s*/, "");
    if (!line) continue;

    // 어디서 자를지 — **순서가 중요합니다.**
    //  ① 탭·두 칸 이상·가운뎃줄표 : 뜻이 아니라 칸을 나누는 표시라 가장 믿을 만합니다
    //  ② 한글이 처음 나오는 곳     : 「apple 사과」 「look after 돌보다, 보살피다」
    //  ③ 쉼표                      : 한글이 아예 없을 때만
    //
    // ⚠️ **쉼표를 먼저 보면 안 됩니다.** 「look after 돌보다, 보살피다」 가
    //    「look after 돌보다」 / 「보살피다」 로 갈라집니다 — 그 쉼표는 **뜻 사이**의 쉼표입니다.
    // ⚠️ 그렇다고 공백으로 쪼개도 안 됩니다. 「come from ~ 출신이다」 가
    //    「come」 / 「from ~ 출신이다」 로 깨집니다 — 구동사가 흔합니다.
    let m = /^(.*?)(?:\t|\s{2,}|\s+[-–—:]\s+)(.+)$/.exec(line);
    if (!m) {
      const i = line.search(/[가-힣]/);
      if (i > 0) m = [null, line.slice(0, i), line.slice(i)];
      else {
        const c = /^(.*?),(.+)$/.exec(line);
        if (c) m = c;
      }
    }
    if (!m) continue;

    // 영어 쪽 끝에 남은 「,」 「~」 「-」 「:」 는 떼어냅니다 (「apple, 사과」 「come from ~ 출신이다」)
    const word = m[1].trim().replace(/[,~\-–—:]+$/, "").trim();
    const meanings = m[2].split(/[,，/]/).map((x) => x.trim()).filter(Boolean);
    if (word && meanings.length) out.push({ word, meanings });
  }
  return out.map((x, i) => ({ no: i + 1, ...x }));
}

// 인쇄된 낱말로 정답표에서 찾기 — **순서가 섞여도** 되게.
// 표기 두 가지를 다 펴서 견줍니다 (come[be] from 이 시험지엔 come from 으로 찍힐 수 있음).
export function 짝찾기(정답표, 인쇄된것) {
  const p = 다듬기(인쇄된것);
  if (!p) return null;
  for (const row of 정답표 ?? []) {
    if (표기풀기(row.word).map(다듬기).includes(p)) return row;
    if ((row.meanings ?? []).some((m) => 다듬기(m) === p)) return row; // 스펠 쓰기: 뜻이 인쇄됨
  }
  return null;
}
