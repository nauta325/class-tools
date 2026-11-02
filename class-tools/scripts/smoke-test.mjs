// 자체 점검 — 키 없이 돌아갑니다.  node scripts/smoke-test.mjs
//
// 왜: 단어 시험지는 **매일 쓰는 기능**이라 조용히 깨지면 안 됩니다.
//   붙여넣기 해석이 제일 잘 깨집니다 — 선생님이 어디서 복사해 오실지 모르니까요.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const { normalizePassage, parseJson, LEVELS } = await import("../lib/claude.js");

let fail = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? "  ok " : "FAIL "} ${label}${cond ? "" : "  → " + JSON.stringify(detail)}`);
  if (!cond) fail++;
};

// ── 붙여넣기 해석 — index.html 의 단어읽기()와 **같은 규칙** ──────────
// (화면 코드를 그대로 떼어 와 검사합니다. 둘이 어긋나면 여기서 잡힙니다.)
const html = readFileSync(resolve(HERE, "..", "index.html"), "utf8");
const m = /function 단어읽기\(text\) \{[\s\S]*?\n\}/.exec(html);
check("index.html 에서 단어읽기() 를 찾았다", !!m);
const 단어읽기 = m ? eval(`(${m[0].replace("function 단어읽기", "function")})`) : () => [];

check("「영어 뜻」 한 칸 띄우기", 단어읽기("apple 사과").length === 1);
check("뜻까지 읽는다", 단어읽기("apple 사과")[0]?.ko === "사과");
check("탭 구분", 단어읽기("apple\t사과")[0]?.ko === "사과");
check("쉼표 구분", 단어읽기("apple,사과")[0]?.ko === "사과");
check("여러 칸", 단어읽기("apple     사과")[0]?.ko === "사과");
check("가운데 줄표", 단어읽기("apple - 사과")[0]?.ko === "사과");
check("앞 번호 「1. 」 떼기", 단어읽기("1. apple 사과")[0]?.en === "apple");
check("앞 번호 「2) 」 떼기", 단어읽기("2) brave 용감한")[0]?.en === "brave");
check("뜻이 두 낱말", 단어읽기("decide 결정하다 정하다")[0]?.ko === "결정하다 정하다");
check("뜻 없이 영어만", 단어읽기("apple")[0]?.ko === "");
check("빈 줄은 건너뛴다", 단어읽기("apple 사과\n\n\nbrave 용감한").length === 2);
check("★ 같은 낱말은 하나로", 단어읽기("apple 사과\napple").length === 1);
check("★ 겹칠 때 뜻 있는 쪽을 남긴다", 단어읽기("apple\napple 사과")[0]?.ko === "사과");
check("대소문자 달라도 같은 낱말", 단어읽기("Apple 사과\napple").length === 1);
check("빈 입력", 단어읽기("").length === 0);
check("공백만", 단어읽기("   \n  \n").length === 0);

// ── 지문 JSON 정리 ──────────────────────────────────────
const good = normalizePassage({
  title: "Plastic", passage: "A\n\nB", trans: "가나",
  words: [{ en: "reduce", ko: "줄이다" }, { en: "", ko: "버림" }],
  quiz: [{ q: "무엇?", choices: ["①가", "②나"], answer: 1, why: "근거" }],
});
check("빈 낱말은 버린다", good.words.length === 1);
check("문제가 남는다", good.quiz.length === 1 && good.quiz[0].answer === 1);
const bad = normalizePassage({ quiz: [{ q: "x", choices: ["①"], answer: 9 }] });
check("★ 보기가 하나뿐인 문제는 버린다", bad.quiz.length === 0);
const over = normalizePassage({ quiz: [{ q: "x", choices: ["①", "②"], answer: 9 }] });
check("★ 범위 넘는 정답은 0 으로 (정답지가 비면 안 됨)", over.quiz[0]?.answer === 0);
check("아무것도 없어도 안 터진다", normalizePassage(null).words.length === 0);
check("문자열이 와도 안 터진다", normalizePassage("뭐지").quiz.length === 0);

// ── JSON 건져내기 ───────────────────────────────────────
check("```json 으로 감싸도 읽는다", parseJson('```json\n{"a":1}\n```').a === 1);
check("앞뒤에 말이 붙어도 읽는다", parseJson('네! {"a":2} 입니다').a === 2);

// ── 레벨 ────────────────────────────────────────────────
check("레벨 6종이 다 있다", Object.keys(LEVELS).length === 6);
check("레벨마다 낱말 수·문장 길이가 있다",
  Object.values(LEVELS).every((l) => l.words && l.sentence && l.note));

console.log(fail ? `\n❌ ${fail}개 실패` : "\n✅ 전부 통과");
process.exit(fail ? 1 : 0);
