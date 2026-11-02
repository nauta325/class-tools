// 채점 한 판 — lib/vocab.js 규칙만으로 (AI·DB 없이)
// 채점 **한 판**이 제대로 도는지 — 규칙 하나하나가 아니라 **시험지 한 장 전체**.
//   node scripts/vocab-sheet-test.mjs
// AI·DB 없이 lib/vocab.js 만으로 돕니다 (읽은 결과를 손으로 만들어 넣습니다).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const V = await import(resolve(dirname(fileURLToPath(import.meta.url)), "..", "lib", "vocab.js"));
let fail=0; const t=(l,c,d)=>{console.log(`${c?"  ok ":"FAIL "} ${l}${c?"":"  → "+JSON.stringify(d)}`);if(!c)fail++;};

const 정답표 = { items: [
  {no:1,word:"apple",meanings:["사과"]},
  {no:2,word:"examine",meanings:["살펴보다","조사하다"]},
  {no:3,word:"come[be] from",meanings:["~ 출신이다"]},
  {no:4,word:"judg(e)ment",meanings:["판단","판결"]},
  {no:5,word:"brave",meanings:["용감한"]},
]};

console.log("── 뜻 쓰기 (영어가 인쇄됨) ──");
const 읽은 = { items: [
  {no:1,printed:"apple",   written:"사과"},        // 맞음
  {no:2,printed:"examine", written:"조사한다"},     // 어미만 다름 → 맞음
  {no:3,printed:"be from", written:"~ 출신이다"},   // 표기 펴서 찾음
  {no:4,printed:"judgment",written:""},            // 빈칸
  {no:5,printed:"brave",   written:"용[?]한"},      // 못 읽음 → ❓
]};
const 결과 = [];
for (const it of 읽은.items) {
  const row = V.짝찾기(정답표.items, it.printed);
  const mark = V.문항채점({ mode:"meaning", key: row?.meanings ?? [], written: it.written });
  결과.push({no:it.no, mark});
}
t("1 사과 → 맞음", 결과[0].mark==="ok");
t("★ 2 「조사한다」 → 맞음 (어미)", 결과[1].mark==="ok");
t("★ 3 be from 으로 인쇄돼도 찾음", 결과[2].mark==="ok");
t("4 빈칸 → blank", 결과[3].mark==="blank");
t("★ 5 [?] → ❓ (짐작 안 함)", 결과[4].mark==="q");

const c = V.모아세기(결과.map(x=>({mark:x.mark})));
t("틀린 수 = 1 (빈칸만)", c.wrong===1, c);
t("❓는 틀림에 안 셈", c.question===1, c);
t("점수 -1/5", V.점수표기(c.wrong,c.total)==="-1/5");

console.log("\n── 스펠 쓰기 (우리말이 인쇄됨) ──");
const 스펠 = [
  {printed:"사과", written:"apple"},
  {printed:"조사하다", written:"examin"},      // 철자 틀림
  {printed:"~ 출신이다", written:"be from"},   // 표기 둘 중 하나
  {printed:"판단", written:"judgement"},       // 괄호 표기
];
const r2 = 스펠.map(it=>{
  const row = V.짝찾기(정답표.items, it.printed);
  return V.문항채점({ mode:"spell", key: row?.word ?? "", written: it.written });
});
t("★ 뜻이 인쇄돼도 정답표에서 찾음", r2[0]==="ok");
t("철자 틀리면 틀림", r2[1]==="no");
t("★ come[be] from → be from 맞음", r2[2]==="ok");
t("★ judg(e)ment → judgement 맞음", r2[3]==="ok");

console.log("\n── 재시 판정 ──");
t("20문항 3개 → 통과", V.재시인가(3,20,15)===false);
t("20문항 4개 → 재시", V.재시인가(4,20,15)===true);

console.log(fail?`\n❌ ${fail}개 실패`:"\n✅ 전부 통과");
process.exit(fail?1:0);
