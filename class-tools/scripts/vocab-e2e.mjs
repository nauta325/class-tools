// 단어 사진 채점 — **처음부터 끝까지** 한 번 (정답표 → 채점 → 선생님 고치기 → 확정).
//   cd ../attendance-report/scripts/verify && node <이 파일>    (playwright 가 거기 있습니다)
//
// 무엇이 진짜이고 무엇이 가짜인가
//   · **채점은 진짜** — lib/vocab.js 규칙을 그대로 씁니다
//   · **화면도 진짜** — 크롬으로 눌러서 돕니다
//   · **사진 읽기(AI)와 DB 는 가짜** — 「읽은 결과」를 손으로 만들어 넣습니다
//     (진짜 사진 판독은 Claude 키가 있어야 해서, 원장님이 한 번 찍어보셔야 압니다)
// ★ 어느 컴퓨터에서나 돌게: playwright 는 **돌리는 폴더**에서 찾고,
//   우리 파일은 **이 파일 기준**으로 찾습니다 (절대 경로를 박아 두면 남의 컴퓨터에서 안 돕니다).
import { createRequire } from "node:module";
const { chromium } = createRequire(process.cwd() + "/")("playwright");
const V = await import(new URL("../lib/vocab.js", import.meta.url).href);
const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--headless","--no-sandbox"] });
const p = await b.newPage({ viewport:{width:430,height:900} });
const 오류=[]; p.on("pageerror",e=>오류.push(String(e)));
let fail=0; const t=(l,c,d)=>{console.log(`${c?"  ok ":"FAIL "} ${l}${c?"":"  → "+JSON.stringify(d)}`);if(!c)fail++;};

// 가짜 서버 — 채점은 **진짜 규칙**(lib/vocab.js)으로
let 정답표 = null, 기록 = null;
await p.route("**/api/**", async (route) => {
  const u = route.request().url();
  if (!u.includes("/api/vocab")) return route.fulfill({status:200,body:"{}"});
  const q = JSON.parse(route.request().postData()||"{}");
  let out = {};
  if (q.action === "setup") out = { students:[{student_id:"s001",name:"김민준"}], keys: 정답표?[{id:"k1",book:정답표.book,day:정답표.day,mode:정답표.mode,items:정답표.items}]:[], retestPercent:15, ai:true };
  else if (q.action === "key-paste") { const items=V.정답표읽기(q.text); out={items,help:items.length?"":"못 읽었습니다"}; }
  else if (q.action === "key-save") { 정답표={...q,items:q.items}; out={ok:true,id:"k1",count:q.items.length}; }
  else if (q.action === "grade") {
    // 「읽은 결과」를 손으로 — 일부러 몇 개 틀리게
    const 읽은 = [
      {no:1,printed:"apple",   written:"사과"},
      {no:2,printed:"examine", written:"조사한다"},
      {no:3,printed:"be from", written:"~ 출신이다"},
      {no:4,printed:"judgment",written:""},
      {no:5,printed:"brave",   written:"용[?]한"},
    ];
    const mode = q.mode || "meaning";
    const items = 읽은.map(it=>{
      const row = 정답표 ? V.짝찾기(정답표.items, it.printed) : null;
      const key = row ? (mode==="spell"?row.word:row.meanings) : (mode==="spell"?"":[]);
      return { no:it.no, printed:it.printed, written:it.written,
               key: row ? (mode==="spell"?V.표기풀기(row.word).join(" / "):(row.meanings||[]).join(", ")) : "",
               mark: V.문항채점({mode,key,written:it.written}) };
    });
    const c = V.모아세기(items);
    기록 = { id:"g1", items, total:c.total, wrong:c.wrong, score_text:V.점수표기(c.wrong,c.total),
             noKey:!정답표, head:{book:q.book||"능률 VOCA",day:q.day||"03",mode}, retest:V.재시인가(c.wrong,c.total,15), photo:null };
    out = 기록;
  }
  else if (q.action === "fix") {
    기록.items = 기록.items.map(it=>it.no===q.no?{...it,mark:q.mark,fixed:true}:it);
    const c = V.모아세기(기록.items);
    out = { items:기록.items, total:c.total, wrong:c.wrong, score_text:V.점수표기(c.wrong,c.total),
            retest:V.재시인가(c.wrong,c.total,15), added: q.addMeaning?"용감한":null };
    기록 = {...기록, ...out};
  }
  else if (q.action === "confirm") out = { ok:true, status:q.status };
  route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(out)});
});

await p.goto(new URL("../index.html", import.meta.url).href,{waitUntil:"load"});
await p.waitForTimeout(600);
await p.click('.tab[data-t="vocab"]'); await p.waitForTimeout(400);
t("단어 채점 판이 열린다", await p.isVisible("#p-vocab"));
t("★ API 비용 안내가 보인다", (await p.textContent("#p-vocab")).includes("Claude API 가 쓰입니다"));

console.log("\n── ① 정답표 만들기 (붙여넣기) ──");
await p.click('#p-vocab .tab[data-v="key"]'); await p.waitForTimeout(200);
await p.fill("#kBook","능률 VOCA 중등"); await p.fill("#kDay","03");
await p.fill("#kPaste", "apple 사과\nexamine 살펴보다, 조사하다\ncome[be] from ~ 출신이다\njudg(e)ment 판단, 판결\nbrave 용감한");
await p.click("#kParse"); await p.waitForTimeout(300);
const 초안 = await p.$$eval("#kTable tbody tr", r=>r.length);
t("5개를 읽었다", 초안===5, 초안);
const w3 = await p.$eval('#kTable input[data-k="word"][data-i="2"]', e=>e.value);
t("★ 구동사가 안 깨짐", w3==="come[be] from", w3);
const m2 = await p.$eval('#kTable input[data-k="meanings"][data-i="1"]', e=>e.value);
t("★ 뜻 두 개", m2==="살펴보다, 조사하다", m2);
await p.click("#kSave"); await p.waitForTimeout(300);
t("저장됨", (await p.textContent("#kMsg")).includes("저장"));

console.log("\n── ② 사진 채점 ──");
await p.click('#p-vocab .tab[data-v="shot"]'); await p.waitForTimeout(200);
await p.evaluate(async () => {
  const c=document.createElement("canvas"); c.width=1200;c.height=1600;
  const g=c.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,1200,1600);
  const bl=await new Promise(ok=>c.toBlob(ok,"image/png"));
  const dt=new DataTransfer(); dt.items.add(new File([bl],"t.png",{type:"image/png"}));
  const el=document.getElementById("vImg"); el.files=dt.files;
  el.dispatchEvent(new Event("change",{bubbles:true}));
});
await p.waitForTimeout(900);
await p.selectOption("#vStu","s001");
await p.click("#vGo"); await p.waitForTimeout(600);
const 판 = await p.textContent("#vResult");
t("점수가 -1/5", 판.includes("-1/5"), 판.slice(0,80));
t("통과로 뜬다 (5문항 1개 틀림)", 판.includes("통과"));
const 판정들 = await p.$$eval("#vResult tbody tr .mk.on", x=>x.map(e=>e.textContent));
t("★ 판정 = 맞·맞·맞·틀·❓", JSON.stringify(판정들)===JSON.stringify(["✅","✅","✅","❌","❓"]), 판정들);
t("정답 칸이 보인다", 판.includes("살펴보다"));

console.log("\n── ③ 선생님이 고치기 ──");
p.once("dialog", d=>d.accept());   // 「이 뜻도 맞음」 확인창
await p.click('#vResult .mk[data-no="5"][data-m="ok"]'); await p.waitForTimeout(400);
const 판2 = await p.textContent("#vResult");
t("★ ❓ 를 ✅ 로 고치면 점수가 그대로 -1/5", 판2.includes("-1/5"), 판2.slice(0,70));
t("정답표에 뜻을 더했다고 알림", (await p.textContent("#vMsg")).includes("정답표에 넣었"));
await p.click('#vResult .mk[data-no="1"][data-m="no"]'); await p.waitForTimeout(400);
t("★ ✅ 를 ❌ 로 고치면 -2/5 로 다시 셈", (await p.textContent("#vResult")).includes("-2/5"));

console.log("\n── ④ 확정 ──");
await p.click('[data-conf="retest"]'); await p.waitForTimeout(300);
t("재시로 기록", (await p.textContent("#vMsg")).includes("재시"));

console.log("\nJS 오류:", 오류.length?"🔴 "+오류.join(" / "):"✅ 없음");
if(오류.length) fail++;
await b.close();
console.log(fail?`\n❌ ${fail}개 실패`:"\n✅ 처음부터 끝까지 통과");
process.exit(fail?1:0);
