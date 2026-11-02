// 채점 — ★ **서버에서만** 돕니다.
//
// 왜 중요한가: 정답을 브라우저로 보내면 개발자 도구에서 그냥 보입니다.
//   그러면 이 기능 전체가 쓸모없어져요. 그래서
//   · 학생 화면에는 **문항 수와 종류만** 내려갑니다 (정답·모범답안·해설 없음)
//   · 맞았는지 틀렸는지는 **서버가 판단해서 번호만** 돌려줍니다
//   · 정답·해설은 **다시 풀기까지 끝난 뒤에만** 내려갑니다
//
// 이 파일에는 DB 가 없습니다 — 순수 계산만. 그래야 점검을 돌릴 수 있습니다.

// 문항 하나를 **학생에게 보여줄 모양**으로 (정답을 뺍니다)
export function 학생용문항(item) {
  return {
    no: Number(item?.no) || 0,
    kind: item?.kind === "essay" ? "essay" : "choice",
    point: Number(item?.point) || 1,
    // ★ answers · model · why 는 **절대 넣지 않습니다**
  };
}

export function 학생용시험지(exam) {
  return {
    id: exam.id,
    title: exam.title,
    total: Number(exam.total) || (exam.items ?? []).length,
    items: (exam.items ?? []).map(학생용문항),
  };
}

// 답 하나를 번호 배열로 — 3 · "3" · [1,4] · "1,4" 전부 받습니다.
export function 번호들(v) {
  if (v == null || v === "") return [];
  const arr = Array.isArray(v) ? v : String(v).split(/[,\s]+/);
  return [...new Set(arr.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 9))].sort();
}

// 객관식 맞았나 — **고른 것이 정답과 정확히 같아야** 맞습니다.
// (복수 정답 ①,④ 인데 ① 만 고르면 틀린 것으로 봅니다. 부분점수는 안 줍니다 —
//  줬다가 「왜 반만 주냐」는 말이 더 많습니다. 필요하면 여기만 고치면 됩니다.)
export function 객관식맞나(정답, 낸것) {
  const a = 번호들(정답);
  const b = 번호들(낸것);
  if (!a.length) return null; // 정답을 안 적어둔 문항 — 채점에서 뺍니다
  if (!b.length) return false;
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

// 처음 낸 답을 채점 → 틀린 번호
export function 틀린번호(items, first) {
  const out = [];
  for (const it of items ?? []) {
    if (it?.kind === "essay") continue; // 서술형은 학생이 스스로 봅니다
    const r = 객관식맞나(it?.answers, first?.[String(it?.no)]);
    if (r === false) out.push(Number(it.no));
  }
  return out.sort((x, y) => x - y);
}

// 다시 푼 것 중 맞힌 번호 (점수엔 안 들어갑니다 — 「다시 풀어 맞힘」 표시용)
export function 다시맞힌번호(items, wrong, second) {
  const 집 = new Set(wrong ?? []);
  const out = [];
  for (const it of items ?? []) {
    if (!집.has(Number(it?.no)) || it?.kind === "essay") continue;
    if (객관식맞나(it?.answers, second?.[String(it?.no)]) === true) out.push(Number(it.no));
  }
  return out.sort((x, y) => x - y);
}

// 점수 = 처음 낸 객관식 + 서술형 자기채점
//   서술형: 맞음 = 배점 전부 · 부분 = 절반 · 틀림 = 0
export function 점수내기(items, first, self) {
  let got = 0, max = 0;
  for (const it of items ?? []) {
    const 배점 = Number(it?.point) || 1;
    if (it?.kind === "essay") {
      max += 배점;
      const s = self?.[String(it?.no)];
      if (s === "ok") got += 배점;
      else if (s === "part") got += 배점 / 2;
    } else {
      const r = 객관식맞나(it?.answers, first?.[String(it?.no)]);
      if (r === null) continue; // 정답이 없는 문항은 만점에서도 뺍니다
      max += 배점;
      if (r) got += 배점;
    }
  }
  return { score: Math.round(got * 10) / 10, max: Math.round(max * 10) / 10 };
}

// ── 정답 붙여넣기 읽기 ────────────────────────────────────
// 「1 ③ 2 ⑤ 3 ①,④ …」 를 문항별로 나눕니다.
//
// ⚠️⚠️ **동그라미를 먼저 숫자로 바꾸면 안 됩니다.**
//   「1 ③ 2 ⑤」 가 「1 3 2 5」 가 되는 순간 **어디까지가 번호고 어디부터가 답인지**
//   알 수 없게 됩니다. 처음에 그렇게 짰다가 `{1:[3,2,5,...]}` 가 나왔습니다.
//   동그라미가 바로 그 구분자입니다 — 끝까지 살려둬야 합니다.
//
// 그래서 세 가지 모양을 **순서대로** 봅니다:
//   ① 동그라미가 있으면 → 숫자=번호, 동그라미=답   「1 ③ 2 ⑤ 3 ①,④」
//   ② 줄바꿈이 있으면   → 한 줄에 한 문항          「1 3」 / 「7 1,4」
//   ③ 구분자가 있으면   → 「1.3 2.5」 「1)3 2)5」
//   셋 다 아니면 **빈 값**을 돌려줍니다 — 짐작해서 틀리게 읽느니 안 읽는 게 낫습니다.
const 동그라미 = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5, "⑥": 6, "⑦": 7, "⑧": 8, "⑨": 9 };
const 동그라미들 = (s) => [...String(s)].map((c) => 동그라미[c]).filter(Boolean);

export function 정답읽기(text) {
  const s = String(text ?? "").trim();
  if (!s) return {};
  const out = {};
  const 넣기 = (no, 답) => {
    // 같은 번호가 또 나오면 뒤엣것으로 (고쳐 적으신 것으로 봅니다)
    if (no > 0 && 답.length) out[no] = [...new Set(답)].sort((a, b) => a - b);
  };

  // ① 동그라미 방식
  if (/[①-⑨]/.test(s)) {
    const re = /(\d{1,3})\s*[.)\-:]?\s*((?:[①-⑨]\s*[,，]?\s*)+)/g;
    let m;
    while ((m = re.exec(s))) 넣기(Number(m[1]), 동그라미들(m[2]));
    return out;
  }

  // ② 줄 방식 — 한 줄에 한 문항
  const 줄 = s.split("\n").map((x) => x.trim()).filter(Boolean);
  if (줄.length > 1) {
    for (const line of 줄) {
      const m = /^(\d{1,3})\s*[.)\-:]?\s*(.+)$/.exec(line);
      if (m) 넣기(Number(m[1]), 번호들(m[2]));
    }
    return out;
  }

  // ③ 한 줄인데 구분자가 뚜렷할 때 — 「1.3 2.5」 「1)3」 「1:3」 「1-3」
  // ⚠️ 답 쪽에 **공백을 허용하면 안 됩니다.** 「1.3 2.5」 에서 「3 2」 를 묶어 먹어
  //   {1:[2,3]} 이 나왔습니다. 여기서 공백은 **다음 문항이 시작된다**는 뜻입니다.
  //   그래서 답은 **쉼표로만** 이어질 수 있습니다 (「1.1,4」).
  const re3 = /(\d{1,3})\s*[.)\-:]\s*(\d(?:\s*[,，]\s*\d)*)/g;
  let m3, 찾음 = false;
  while ((m3 = re3.exec(s))) { 넣기(Number(m3[1]), 번호들(m3[2])); 찾음 = true; }
  // 셋 다 아니면 빈 값 — 화면이 「이렇게 적어주세요」라고 안내합니다.
  return 찾음 ? out : {};
}
