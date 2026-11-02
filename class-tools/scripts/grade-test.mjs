// 채점 로직 점검 — 키도 DB 도 없이 돕니다.  node scripts/grade-test.mjs
//
// 왜 따로 있나: **틀린 채점은 조용히 틀립니다.** 화면은 멀쩡해 보이는데
//   점수만 이상하게 나오면, 학생이 항의해야 알게 됩니다.
//   특히 두 가지를 봅니다:
//     ① 정답 붙여넣기 — 선생님이 어떻게 적어 오실지 모릅니다
//     ② ★ 정답이 학생 쪽으로 새지 않는가 — 새면 이 기능 전체가 쓸모없습니다
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const g = await import(resolve(dirname(fileURLToPath(import.meta.url)), "..", "lib", "grade.js"));
let fail = 0;
const t = (l, c, d) => { console.log(`${c?"  ok ":"FAIL "} ${l}${c?"":"  → "+JSON.stringify(d)}`); if(!c) fail++; };
const eq = (a,b) => JSON.stringify(a) === JSON.stringify(b);

console.log("── 정답 붙여넣기 ──");
let r = g.정답읽기("1 ③ 2 ⑤ 3 ①,④");
t("★ 사양서 예시 그대로", eq(r, {1:[3],2:[5],3:[1,4]}), r);
r = g.정답읽기("1.③ 2.⑤ 3.①④");
t("동그라미 + 마침표", eq(r, {1:[3],2:[5],3:[1,4]}), r);
r = g.정답읽기("1 3\n2 5\n3 1,4");
t("줄바꿈 방식", eq(r, {1:[3],2:[5],3:[1,4]}), r);
r = g.정답읽기("1) 3\n2) 5");
t("줄바꿈 + 괄호", eq(r, {1:[3],2:[5]}), r);
r = g.정답읽기("1.3 2.5 3.1,4");
t("한 줄 + 마침표", eq(r, {1:[3],2:[5],3:[1,4]}), r);
r = g.정답읽기("1-3 2-5");
t("한 줄 + 줄표", eq(r, {1:[3],2:[5]}), r);
r = g.정답읽기("1 3 2 5 3 1,4");
t("★ 구분자가 없으면 **짐작하지 않는다**", eq(r, {}), r);
r = g.정답읽기("");
t("빈 입력", eq(r, {}), r);
r = g.정답읽기("3 ①\n3 ②");
t("같은 번호 두 번 → 뒤엣것", eq(r, {3:[2]}), r);
r = g.정답읽기("10 ③ 11 ①");
t("두 자리 번호", eq(r, {10:[3],11:[1]}), r);

console.log("\n── 객관식 채점 ──");
t("정답 3, 낸 것 3", g.객관식맞나([3], 3) === true);
t("정답 3, 낸 것 2", g.객관식맞나([3], 2) === false);
t("복수정답 [1,4] 에 1,4", g.객관식맞나([1,4], [1,4]) === true);
t("복수정답 [1,4] 에 4,1 (순서 무관)", g.객관식맞나([1,4], [4,1]) === true);
t("★ 복수정답인데 하나만 → 틀림", g.객관식맞나([1,4], [1]) === false);
t("★ 더 많이 고르면 틀림", g.객관식맞나([3], [1,3]) === false);
t("안 냈으면 틀림", g.객관식맞나([3], "") === false);
t("★ 정답을 안 적어둔 문항은 null (채점에서 뺌)", g.객관식맞나([], 3) === null);
t("문자열 \"3\" 도 받음", g.객관식맞나([3], "3") === true);
t("\"1,4\" 문자열", g.객관식맞나([1,4], "1,4") === true);

console.log("\n── 점수 ──");
const items = [
  {no:1,kind:"choice",answers:[3],point:1},
  {no:2,kind:"choice",answers:[5],point:1},
  {no:3,kind:"choice",answers:[1,4],point:1},
  {no:9,kind:"essay",point:2,model:"모범"},
  {no:10,kind:"essay",point:2,model:"모범"},
];
const first = {"1":3,"2":1,"3":[1,4],"9":"썼음"};
const wrong = g.틀린번호(items, first);
t("틀린 번호 = [2]", eq(wrong,[2]), wrong);
t("★ 서술형은 틀린 번호에 안 들어간다", !wrong.includes(9) && !wrong.includes(10));
const fixed = g.다시맞힌번호(items, wrong, {"2":5});
t("다시 풀어 맞힌 = [2]", eq(fixed,[2]), fixed);
let s = g.점수내기(items, first, {"9":"ok","10":"part"});
t("점수 = 객1+객3 + 서9(2) + 서10(1) = 5 / 7", s.score===5 && s.max===7, s);
t("★ 다시 풀어 맞힌 건 점수에 안 들어간다 (2번은 여전히 0점)", g.점수내기(items,{...first},{}).score === 2);
s = g.점수내기([{no:1,kind:"choice",answers:[],point:1},{no:2,kind:"choice",answers:[3],point:1}], {"2":3}, {});
t("★ 정답 없는 문항은 만점에서도 뺀다 (1/1)", s.score===1 && s.max===1, s);

console.log("\n── 학생에게 정답이 안 새나 ★ ──");
const 공개 = JSON.stringify(g.학생용시험지({id:"x",title:"T",total:5,items}));
t("answers 가 없다", !공개.includes("answers"), 공개.slice(0,120));
t("model(모범답안) 이 없다", !공개.includes("모범"));
t("해설 칸이 없다", !공개.includes("why"));
t("문항 수·종류·배점은 있다", 공개.includes("essay") && 공개.includes("point"));

console.log(fail ? `\n❌ ${fail}개 실패` : "\n✅ 전부 통과");
process.exit(fail?1:0);
