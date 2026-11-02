// 처음부터 끝까지 한 번 돌려보기 — 학생 한 명이 10문항(서술형 2개)을 푸는 전 과정.
//
//   node scripts/e2e.mjs
//
// 무엇이 진짜이고 무엇이 가짜인가 (정직하게):
//   · **채점은 진짜입니다** — `lib/grade.js` 를 그대로 부릅니다.
//   · **화면도 진짜입니다** — 크롬으로 `exam.html` 을 눌러서 돕니다.
//   · **DB 만 가짜입니다** — Supabase 대신 메모리에 담습니다.
//     (진짜 DB 로 하려면 Supabase 를 하나 더 띄워야 해서, 여기서는 안 합니다)
//
// 그래서 이 점검이 잡는 것: 흐름 5단계 · 정답이 새는지 · 점수 계산 · 다시 풀기.
// 못 잡는 것: Supabase 연결·RLS·환경변수. 그건 원장님이 한 번 눌러보셔야 압니다.

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const G = await import(resolve(ROOT, "lib", "grade.js"));

const PORT = 4411;

// ── 가짜 DB ──────────────────────────────────────────────
const 학생 = { student_id: "s001", pin: "1234", name: "김민준", status: "재원" };
const 문항 = [
  { no: 1, kind: "choice", answers: [3], point: 1, why: "주어가 단수라 동사도 단수" },
  { no: 2, kind: "choice", answers: [5], point: 1, why: "" },
  { no: 3, kind: "choice", answers: [1, 4], point: 1, why: "둘 다 맞습니다" },
  { no: 4, kind: "choice", answers: [2], point: 1, why: "" },
  { no: 5, kind: "choice", answers: [4], point: 1, why: "" },
  { no: 6, kind: "choice", answers: [1], point: 1, why: "" },
  { no: 7, kind: "choice", answers: [5], point: 1, why: "" },
  { no: 8, kind: "choice", answers: [2], point: 1, why: "" },
  { no: 9, kind: "essay", answers: [], point: 2, model: "과거분사는 당하는 쪽을 꾸밉니다." },
  { no: 10, kind: "essay", answers: [], point: 2, model: "관계대명사 which 는 사물을 받습니다." },
];
const exam = { id: "e1", title: "2학기 중간 대비 1회", total: 10, items: 문항 };
const tries = new Map();
let seq = 0;

function 처리(a, b) {
  const 로그인 = () => (b.studentId === 학생.student_id && b.pin === 학생.pin ? 학생 : null);
  if (a === "login") {
    if (!로그인()) return [401, { error: "학생번호나 출결번호가 다릅니다." }];
    return [200, { student: 학생, exams: [{ id: exam.id, title: exam.title, total: exam.total }] }];
  }
  if (a === "open") {
    if (!로그인()) return [401, { error: "no" }];
    return [200, { exam: G.학생용시험지(exam) }];
  }
  if (a === "submit") {
    if (!로그인()) return [401, { error: "no" }];
    const wrong = G.틀린번호(exam.items, b.answers || {});
    const id = `t${++seq}`;
    tries.set(id, { id, first: b.answers || {}, wrong, second: {}, self: {}, fixed: [] });
    return [200, { tryId: id, wrong, stage: wrong.length ? "retry" : "done" }];
  }
  if (a === "retry") {
    const t = tries.get(b.tryId);
    if (!t) return [404, { error: "no" }];
    t.second = b.answers || {};
    t.fixed = G.다시맞힌번호(exam.items, t.wrong, t.second);
    return [200, {
      fixed: t.fixed,
      items: exam.items.map((it) => ({
        no: it.no, kind: it.kind, point: it.point, answers: it.answers, model: it.model, why: it.why,
        mine: t.first?.[String(it.no)] ?? null, again: t.second?.[String(it.no)] ?? null,
        wasWrong: t.wrong.includes(it.no),
      })),
    }];
  }
  if (a === "self") {
    const t = tries.get(b.tryId);
    if (!t) return [404, { error: "no" }];
    t.self = b.self || {};
    const { score, max } = G.점수내기(exam.items, t.first, t.self);
    t.score = score; t.max = max;
    return [200, { score, max }];
  }
  return [400, { error: "모르는 action" }];
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
const server = createServer((req, res) => {
  if (req.url?.startsWith("/api/exam")) {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let b = {};
      try { b = JSON.parse(raw || "{}"); } catch {}
      const [code, out] = 처리(b.action, b);
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    });
    return;
  }
  const p = resolve(ROOT, (req.url || "/").split("?")[0].replace(/^\//, "") || "exam.html");
  if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end("no"); }
  res.writeHead(200, { "content-type": MIME[extname(p)] || "text/plain" });
  res.end(readFileSync(p));
});

await new Promise((ok) => server.listen(PORT, ok));

// ── 브라우저로 끝까지 눌러보기 ─────────────────────────────
const require = createRequire(resolve(ROOT, "..", "attendance-report", "scripts", "verify", "x.js"));
let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.log("⚠️ playwright 가 없어 화면 점검은 건너뜁니다"); server.close(); process.exit(0); }
const 크롬 = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);

let fail = 0;
const t = (l, c, d) => { console.log(`${c ? "  ok " : "FAIL "} ${l}${c ? "" : "  → " + JSON.stringify(d)}`); if (!c) fail++; };

const b = await chromium.launch(크롬 ? { executablePath: 크롬, args: ["--headless", "--no-sandbox"] } : {});
const p = await b.newPage({ viewport: { width: 390, height: 844 } }); // 폰 크기로
const 오류 = [];
p.on("pageerror", (e) => 오류.push(String(e)));

// ★ 서버가 학생에게 보내는 것을 **전부 엿들어서** 정답이 새는지 봅니다
const 받은것 = [];
p.on("response", async (r) => {
  if (r.url().includes("/api/exam")) { try { 받은것.push({ url: r.url(), body: await r.text() }); } catch {} }
});

await p.goto(`http://127.0.0.1:${PORT}/exam.html`);

console.log("── ① 로그인 ──");
await p.fill("#sid", "s001"); await p.fill("#pin", "9999");
await p.click("#go"); await p.waitForTimeout(250);
t("틀린 출결번호는 막는다", (await p.textContent("#loginMsg")).includes("다릅니다"));
await p.fill("#pin", "1234"); await p.click("#go"); await p.waitForTimeout(300);
t("맞는 번호로 들어간다", await p.isVisible("#s-list"));
t("이름이 보인다", (await p.textContent("#hello")).includes("김민준"));

console.log("\n── ② 시험지 열기 ──");
await p.click(".exam"); await p.waitForTimeout(300);
t("10문항이 그려졌다", (await p.$$(".q")).length === 10);
t("서술형 2개는 적는 칸", (await p.$$("textarea[data-essay]")).length === 2);

console.log("\n── ★ 정답이 학생에게 내려오나 ──");
const 열기응답 = 받은것.map((x) => x.body).join("\n");
t("정답(answers) 이 안 내려왔다", !/"answers"/.test(열기응답), 열기응답.slice(0, 160));
t("모범답안이 안 내려왔다", !/과거분사는 당하는/.test(열기응답));
t("해설(why) 이 안 내려왔다", !/주어가 단수라/.test(열기응답));

console.log("\n── ③ 풀기 (2·5번을 일부러 틀리게) ──");
const 고르기 = async (no, v) => { await p.click(`.pick button[data-no="${no}"][data-v="${v}"]`); };
await 고르기(1, 3); await 고르기(2, 1); await 고르기(3, 1); await 고르기(3, 4);
await 고르기(4, 2); await 고르기(5, 1); await 고르기(6, 1); await 고르기(7, 5); await 고르기(8, 2);
await p.fill('textarea[data-essay="9"]', "당하는 쪽을 꾸며요");
t("복수정답 3번에 두 개가 켜졌다",
  (await p.$$eval('.pick button[data-no="3"].on', (x) => x.length)) === 2);
await 고르기(3, 4); // 껐다가
t("다시 누르면 꺼진다", (await p.$$eval('.pick button[data-no="3"].on', (x) => x.length)) === 1);
await 고르기(3, 4); // 다시 켜고

p.once("dialog", (d) => d.accept()); // 10번을 안 써서 확인창이 뜰 수 있음
await p.click("#submit"); await p.waitForTimeout(350);

console.log("\n── ④ 틀린 번호만 ──");
t("틀린 번호 화면이 떴다", await p.isVisible("#s-wrong"));
const 틀린 = await p.$$eval("#wrongList span", (x) => x.map((e) => e.textContent));
t("틀린 번호가 2·5 다", JSON.stringify(틀린) === '["2","5"]', 틀린);
const 이때까지 = 받은것.map((x) => x.body).join("\n");
t("★ 이 시점에도 정답은 안 내려왔다", !/"answers"/.test(이때까지));

console.log("\n── ⑤ 틀린 것만 다시 ──");
await p.click("#toRetry"); await p.waitForTimeout(250);
t("두 문항만 나온다", (await p.$$("#qs .q")).length === 2);
await 고르기(2, 5);  // 맞게 고침
await 고르기(5, 3);  // 또 틀림
await p.click("#submit"); await p.waitForTimeout(350);

console.log("\n── ⑥ 정답·해설 ──");
t("정답 화면이 떴다", await p.isVisible("#s-answer"));
const 답판 = await p.textContent("#ansList");
t("처음 답·다시 푼 답·정답이 다 있다",
  답판.includes("처음 답") && 답판.includes("다시 푼 답") && 답판.includes("정답"));
t("2번은 「다시 풀어 맞힘」", /다시 풀어 맞힘/.test(답판));
t("5번은 「틀림」으로 남는다", /틀림/.test(답판));
t("해설이 보인다", 답판.includes("주어가 단수라"));
t("이제는 정답이 내려와 있다", /"answers"/.test(받은것.map((x) => x.body).join("\n")));

console.log("\n── ⑦ 서술형 자기채점 ──");
t("자기채점 화면이 떴다", await p.isVisible("#s-self"));
t("모범답안이 보인다", (await p.textContent("#selfList")).includes("과거분사는 당하는"));
await p.click("#selfGo"); await p.waitForTimeout(200);
t("안 고르면 막는다", (await p.textContent("#selfMsg")).includes("안 고르셨"));
await p.click('.self button[data-no="9"][data-v="ok"]');
await p.click('.self button[data-no="10"][data-v="no"]');
await p.click("#selfGo"); await p.waitForTimeout(300);

console.log("\n── ⑧ 점수 ──");
t("점수 화면이 떴다", await p.isVisible("#s-score"));
const 점 = await p.textContent("#scoreNum");
// 객관식 8문항 중 1·3·4·6·7·8 = 6점 (2·5 틀림) + 서술형 9번 2점 = 8 / 12
t("점수 = 8 / 12", 점.replace(/\s/g, "") === "8/12", 점);
t("★ 다시 풀어 맞힌 2번은 점수에 안 들어갔다", 점.includes("8"));
t("「다시 풀어 맞힘」 안내가 있다", (await p.textContent("#fixedNote")).includes("2"));

console.log("\nJS 오류:", 오류.length ? "🔴 " + 오류.join(" / ") : "✅ 없음");
if (오류.length) fail++;

await b.close();
server.close();
console.log(fail ? `\n❌ ${fail}개 실패` : "\n✅ 처음부터 끝까지 통과");
process.exit(fail ? 1 : 0);
