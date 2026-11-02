// 🎙 카드 강의 — **처음부터 끝까지** 한 번 (로그인 → 듣기 → 기록 → 선생님 현황).
//   cd ../attendance-report/scripts/verify && node <이 파일>    (playwright 가 거기 있습니다)
//
// 무엇이 진짜이고 무엇이 가짜인가
//   · **화면·소리·타이밍은 진짜** — 진짜 크롬에서 진짜 소리를 틀고,
//     판서 줄이 **정해진 초에** 나타나는지 눈으로 보듯 확인합니다
//   · **목소리와 DB 는 가짜** — 짧은 소리(삐 소리)를 만들어 쓰고, 기록은 메모리에
//     (진짜 목소리는 voice-lecture/목소리_만들기.py 로 원장님 컴퓨터에서 만듭니다)
// playwright 는 **돌리는 폴더**에서 찾습니다 (이 앱에는 node_modules 가 없습니다)
import { createRequire } from "node:module";
const { chromium } = createRequire(process.cwd() + "/")("playwright");

// 짧은 wav 만들기 (소리가 있어야 ended 가 옵니다)
function wav(초, sr = 8000) {
  const n = Math.round(sr * 초), d = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) d.writeInt16LE(Math.round(Math.sin(i * 0.05) * 3000), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + d.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(d.length, 40);
  return Buffer.concat([h, d]);
}

const 단원 = {
  단원: "t01", 제목: "현재완료",
  카드: [
    { t: "오늘 배울 것", audio: "lecture-audio/t01/c1.wav", dur: 1.4, 만듦: true,
      lines: [{ h: "<b>현재완료</b>", at: 0, c: "" },
              { h: "have ＋ {{p.p.}}", at: 0.7, c: "" },
              { h: "지금까지 이어지는 이야기", at: 0.7, c: "box" }] },
    { t: "정리", audio: "lecture-audio/t01/c2.wav", dur: 0.8, 만듦: true,
      lines: [{ h: "끝난 시점과는 {{못}} 씁니다", at: 0, c: "" }] },
  ],
};
const 목록 = [{ 단원: "t01", 제목: "현재완료", 카드수: 2 }];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--headless", "--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const p = await b.newPage({ viewport: { width: 430, height: 900 } });
const 오류 = []; p.on("pageerror", (e) => 오류.push(String(e)));
let fail = 0;
const t = (l, c, d) => { console.log(`${c ? "  ok " : "FAIL "} ${l}${c ? "" : "  → " + JSON.stringify(d)}`); if (!c) fail++; };

// 가짜 서버 + 가짜 강의 파일
const 들은것 = new Set();            // "학생|단원|카드"
await p.route("**/lecture-data/**", (r) => {
  const u = decodeURIComponent(r.request().url());
  const body = u.includes("목록.json") ? 목록 : u.includes("t01.json") ? 단원 : null;
  if (!body) return r.fulfill({ status: 404, body: "" });
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
});
await p.route("**/lecture-audio/**", (r) =>
  r.fulfill({ status: 200, contentType: "audio/wav", body: wav(r.request().url().includes("c1") ? 1.4 : 0.8) }));
await p.route("**/api/**", (r) => {
  const u = r.request().url();
  const q = JSON.parse(r.request().postData() || "{}");
  let out = {}, code = 200;
  if (u.includes("/api/login")) {
    if (q.pass !== "1234") { code = 401; out = { error: "비밀번호가 다릅니다." }; } else out = { ok: true };
  } else if (q.action === "me") {
    if (q.pin !== "1111") { code = 401; out = { error: "학생번호나 비밀번호(출결PIN)가 다릅니다." }; }
    else out = { name: "김민준", studentId: q.studentId, heard: {} };
  } else if (q.action === "heard") {
    들은것.add(`${q.studentId}|${q.unit}|${q.card}`); out = { ok: true };
  } else if (q.action === "teacher") {
    const counts = {};
    for (const k of 들은것) { const [s, u2] = k.split("|"); (counts[s] = counts[s] || {})[u2] = (counts[s][u2] || 0) + 1; }
    out = { students: [{ student_id: "s001", name: "김민준" }], counts };
  }
  r.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(out) });
});

await p.goto(new URL("../lecture.html", import.meta.url).href, { waitUntil: "load" });
const 보임 = (s) => p.isVisible(s);
const 줄들 = () => p.$$eval(".lvl", (e) => e.map((x) => x.className.includes("on")));

console.log("── ① 로그인 ──");
await p.fill("#sid", "s001"); await p.fill("#pin", "9999");
await p.click("#loginBtn"); await p.waitForTimeout(300);
t("★ 비밀번호가 틀리면 들어가지 못한다", (await p.textContent("#loginMsg")).includes("다릅니다"));
await p.fill("#pin", "1111"); await p.click("#loginBtn"); await p.waitForTimeout(400);
t("들어가면 단원 목록", await 보임("#vUnits"));
t("이름이 보인다", (await p.textContent("#hiName")).includes("김민준"));
t("아직 0 / 2", (await p.textContent("#unitList")).includes("0 / 2"));

console.log("\n── ② 카드 강의 ──");
await p.click(".unit"); await p.waitForTimeout(300);
t("강의 화면", await 보임("#vPlay"));
t("카드 1 / 2", (await p.textContent("#lvN")).trim() === "1 / 2");
// 0초 줄(제목)은 처음부터 보입니다 — 빈 화면으로 시작하면 무슨 카드인지 모르니까요.
// 나머지는 **그 말을 할 때** 나타나야 합니다.
t("★ 틀기 전에는 0초 줄만 보인다", (await 줄들()).slice(1).every((x) => !x), await 줄들());
t("형광펜", (await p.innerHTML("#lvScr")).includes('<mark class="lvm">p.p.</mark>'));
t("색 상자", await 보임(".lvl.box"));

await p.click("#bPlay"); await p.waitForTimeout(350);
let 보인줄 = await 줄들();
t("★ 0초 줄만 먼저 나타난다", 보인줄[0] === true && 보인줄[1] === false, 보인줄);
await p.waitForTimeout(600);
보인줄 = await 줄들();
t("★ 0.7초가 되면 나머지 줄도 나타난다", 보인줄.every((x) => x), 보인줄);
t("진행 막대가 움직인다", parseFloat(await p.$eval("#lvBar", (e) => e.style.width)) > 10);

await p.waitForTimeout(1800);   // 카드1 끝 → 0.9초 뒤 카드2 자동 재생
t("★ 카드가 끝나면 다음 카드로 저절로", (await p.textContent("#lvN")).trim() === "2 / 2");
t("★ 끝까지 들은 카드만 기록된다", 들은것.has("s001|t01|1"), [...들은것]);
t("아직 다 들은 건 아니다", !(await 보임("#doneBox")));

await p.waitForTimeout(1500);   // 카드2 끝
t("마지막 카드도 기록", 들은것.has("s001|t01|2"), [...들은것]);
t("★ 마지막까지 들어야 「다 들었어요」", await 보임("#doneBox"));

console.log("\n── ③ 되돌아보기 ──");
await p.click("#bSpeed");
t("빠르기 1.2×", (await p.textContent("#bSpeed")).includes("1.2"));
await p.click("#bBack"); await p.waitForTimeout(250);
t("단원 목록에 ✅", (await p.textContent("#unitList")).includes("다 들었어요"));

console.log("\n── ④ 선생님 현황 ──");
await p.click("#toTeacher2"); await p.waitForTimeout(150);   // 단원 목록에서도 들어가집니다
await p.fill("#tpass", "0000"); await p.click("#tBtn"); await p.waitForTimeout(300);
t("★ 선생님 비밀번호가 틀리면 못 본다", (await p.textContent("#tMsg")).includes("다릅니다"));
t("표가 안 나온다", (await p.textContent("#tTable")).trim() === "");
await p.fill("#tpass", "1234"); await p.click("#tBtn"); await p.waitForTimeout(400);
const 표 = await p.textContent("#tTable");
t("학생 줄이 있다", 표.includes("김민준"));
t("★ 2장 다 들었으면 ✅", 표.includes("✅"), 표);

console.log("\n" + (오류.length ? "JS 오류: " + 오류.join(" / ") : "JS 오류 없음"));
if (오류.length) fail++;
await b.close();
console.log(fail ? `\n❌ ${fail}군데 틀렸습니다.` : "\n✅ 처음부터 끝까지 통과");
process.exit(fail ? 1 : 0);
