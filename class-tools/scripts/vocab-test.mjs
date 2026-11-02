// 단어 채점 규칙 점검 — 키도 DB 도 없이 돕니다.  node scripts/vocab-test.mjs
//
// 왜 제일 공들였나: **채점이 틀리면 아이가 억울합니다.**
//   맞게 쓴 걸 틀렸다고 하면 그 아이는 재시를 봅니다. 화면은 멀쩡해 보이고요.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const V = await import(resolve(dirname(fileURLToPath(import.meta.url)), "..", "lib", "vocab.js"));

let fail = 0;
const t = (l, c, d) => { console.log(`${c ? "  ok " : "FAIL "} ${l}${c ? "" : "  → " + JSON.stringify(d)}`); if (!c) fail++; };
const 같나 = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

console.log("── 표기 두 가지 풀기 ──");
let r = V.표기풀기("come[be] from");
t("★ come[be] from → come from · be from", 같나(r, ["come from", "be from"]), r);
r = V.표기풀기("judg(e)ment");
t("★ judg(e)ment → judgment · judgement", 같나(r, ["judgment", "judgement"]), r);
r = V.표기풀기("look[take] after");
t("look[take] after", 같나(r, ["look after", "take after"]), r);
r = V.표기풀기("in (the) front of");
t("괄호가 낱말 전체", 같나(r, ["in the front of", "in front of"]), r);
t("아무 표시 없으면 하나", 같나(V.표기풀기("apple"), ["apple"]));
t("빈 값", V.표기풀기("").length === 0);
r = V.표기풀기("a(n) old[new] one");
t("둘이 섞여도", r.length === 4, r);

console.log("\n── 스펠 쓰기 ──");
t("정확히 쓰면 맞음", V.철자맞나("apple", "apple") === "ok");
t("대문자로 써도 맞음", V.철자맞나("apple", "Apple") === "ok");
t("앞뒤 공백 무시", V.철자맞나("apple", "  apple ") === "ok");
t("여러 칸 → 한 칸", V.철자맞나("come from", "come  from") === "ok");
t("★ 철자가 다르면 틀림", V.철자맞나("apple", "aple") === "no");
t("★ 표기 둘 중 아무거나 맞음(1)", V.철자맞나("come[be] from", "be from") === "ok");
t("★ 표기 둘 중 아무거나 맞음(2)", V.철자맞나("come[be] from", "come from") === "ok");
t("judgement 도 맞음", V.철자맞나("judg(e)ment", "judgement") === "ok");
t("빈칸", V.철자맞나("apple", "") === "blank");
t("★ 하이픈은 지우지 않는다", V.철자맞나("well-known", "wellknown") === "no");

console.log("\n── 뜻 쓰기 ──");
const 뜻 = ["살펴보다", "조사하다"];
t("등록된 뜻 그대로", V.뜻맞나(뜻, "조사하다") === "ok");
t("두 번째 뜻도 맞음", V.뜻맞나(뜻, "살펴보다") === "ok");
t("★ 어미만 다름 「조사한다」", V.뜻맞나(뜻, "조사한다") === "ok");
t("★ 「조사」 만 써도 맞음", V.뜻맞나(뜻, "조사") === "ok");
t("★ 전혀 다르면 AI 에게 물음", V.뜻맞나(뜻, "달리다") === "ask");
t("문자열로 와도 쪼갠다", V.뜻맞나("살펴보다, 조사하다", "조사하다") === "ok");
t("빈칸", V.뜻맞나(뜻, "") === "blank");
t("정답표가 없으면", V.뜻맞나([], "조사하다") === "nokey");

console.log("\n── 문항 채점 ──");
t("[?] 가 있으면 ❓", V.문항채점({ mode: "spell", key: "apple", written: "ap[?]le" }) === "q");
t("정답표 없는 문항은 ❓", V.문항채점({ mode: "spell", key: "", written: "apple" }) === "q");
t("스펠 맞음", V.문항채점({ mode: "spell", key: "apple", written: "apple" }) === "ok");
t("뜻 물어봐야 함", V.문항채점({ mode: "meaning", key: 뜻, written: "뛰다" }) === "ask");

console.log("\n── 점수·재시 ──");
t("다 맞으면 100", V.점수표기(0, 20) === "100");
t("3개 틀리면 -3/20", V.점수표기(3, 20) === "-3/20");
t("★ 20문항 3개 틀림 → 통과 (15%)", V.재시인가(3, 20, 15) === false);
t("★ 20문항 4개 틀림 → 재시", V.재시인가(4, 20, 15) === true);
t("기준을 10% 로 바꾸면 3개도 재시", V.재시인가(3, 20, 10) === true);
t("기준이 이상하면 15% 로", V.재시인가(4, 20, null) === true);
t("문항이 0이면 재시 아님", V.재시인가(0, 0, 15) === false);

console.log("\n── 붙여넣기로 정답표 ──");
let k = V.정답표읽기("apple\t사과\nexamine\t살펴보다, 조사하다");
t("탭 구분", k.length === 2 && k[1].meanings.length === 2, k);
t("★ 첫 구분자까지가 단어 — 뜻의 쉼표에 안 속는다",
  같나(k[1].meanings, ["살펴보다", "조사하다"]) && k[1].word === "examine", k[1]);
k = V.정답표읽기("1. apple, 사과\n2) examine, 살펴보다, 조사하다");
t("앞 번호를 떼고 쉼표로", k.length === 2 && k[1].word === "examine" && k[1].meanings.length === 2, k);
t("★ 한 칸만 띄운 「apple 사과」", V.정답표읽기("apple 사과")[0]?.word === "apple");
k = V.정답표읽기("come from ~ 출신이다");
t("★ 구동사가 안 깨진다 (공백으로 쪼개면 깨짐)", k[0]?.word === "come from", k);
t("   그 뜻도 제대로", k[0]?.meanings[0] === "출신이다", k);
k = V.정답표읽기("look after 돌보다, 보살피다");
t("★ 구동사 + 뜻 두 개", k[0]?.word === "look after" && k[0]?.meanings.length === 2, k);
t("빈 줄은 건너뜀", V.정답표읽기("apple 사과\n\n\n").length === 1);
t("뜻이 없으면 버림", V.정답표읽기("apple").length === 0);

console.log("\n── 인쇄된 낱말로 짝 찾기 (순서 섞여도) ──");
const 표 = [{ no: 1, word: "come[be] from", meanings: ["~ 출신이다"] }, { no: 2, word: "examine", meanings: ["살펴보다", "조사하다"] }];
t("표기를 펴서 찾는다", V.짝찾기(표, "be from")?.no === 1);
t("그냥 낱말", V.짝찾기(표, "examine")?.no === 2);
t("대문자로 인쇄돼도", V.짝찾기(표, "Examine")?.no === 2);
t("★ 스펠 쓰기 — 뜻이 인쇄돼도 찾는다", V.짝찾기(표, "조사하다")?.no === 2);
t("없는 낱말", V.짝찾기(표, "zzz") === null);

console.log(fail ? `\n❌ ${fail}개 실패` : "\n✅ 전부 통과");
process.exit(fail ? 1 : 0);
