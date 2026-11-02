// Supabase — **서버에서만** 씁니다 (service_role).
//
// ★ 학생 명단은 새로 만들지 않습니다. 세미나에서 만드신 `students` 표를 그대로 봅니다.
//   그래서 SUPABASE_URL 은 **학원 시스템과 같은 프로젝트**를 가리켜야 합니다.
//
// ⚠️ `service_role` 키를 브라우저로 내보내지 마세요. 이 파일은 api/*.js 에서만 부릅니다.

const URL_ = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const KEY = (process.env.SUPABASE_SERVICE_KEY || "").trim();

export function dbConfigured() {
  return Boolean(URL_ && KEY);
}

// ★ http:// 로 적으면 인증 헤더가 떨어져 나가서, **오류 없이 0건**이 옵니다.
//   무엇이 틀렸는지 알 수가 없어 제일 오래 걸리는 사고라 미리 잡습니다.
function 주소점검() {
  if (!URL_) throw new Error("SUPABASE_URL 이 없습니다. Vercel 환경변수에 넣고 Redeploy 하세요.");
  if (!KEY) throw new Error("SUPABASE_SERVICE_KEY 가 없습니다 (anon 말고 **service_role**).");
  if (/^http:\/\//i.test(URL_)) {
    throw new Error(
      `SUPABASE_URL 이 http:// 로 돼 있습니다. **https** 로 고치세요 → ` +
        URL_.replace(/^http:/i, "https:")
    );
  }
}

async function call(path, init = {}) {
  주소점검();
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const t = await r.text();
  if (!r.ok) {
    // 표가 없을 때가 제일 흔합니다 — SQL 을 안 돌리신 것.
    // ★ **어느 SQL 파일**인지까지 말해줍니다. 「표가 없습니다」 만으로는 뭘 해야 할지 모릅니다.
    if (/does not exist/i.test(t) || /PGRST205/.test(t)) {
      const 어디 =
        /vocab_/.test(t) ? "sql/vocab.sql (단어 사진 채점)"
        : /lecture_/.test(t) ? "sql/lecture.sql (목소리 카드 강의)"
        : /exam/.test(t) ? "sql/grading.sql (시험지 채점)"
        : /students/.test(t) ? "학원 시스템의 SQL — 이 앱의 SUPABASE_URL 이 **학원 시스템과 같은 프로젝트**인지 보세요"
        : "sql/ 폴더의 SQL";
      throw new Error(`표가 아직 없습니다. Supabase → SQL Editor 에서 \`${어디}\` 을 한 번 돌려주세요.`);
    }
    if (r.status === 401 || /JWT|apikey/i.test(t)) {
      throw new Error("Supabase 키가 안 맞습니다. **service_role** 키인지 확인하세요 (anon 아님).");
    }
    throw new Error(`Supabase 오류 ${r.status}: ${t.slice(0, 200)}`);
  }
  return t ? JSON.parse(t) : null;
}

export const select = (table, q) => call(`${table}?${q}`);
// prefer 를 바꿔 쓰는 곳: 같은 줄을 또 넣어도 그냥 넘어가게
// (`return=representation,resolution=ignore-duplicates` — 카드를 두 번 들었을 때)
export const insert = (table, row, prefer = "return=representation") =>
  call(table, { method: "POST", headers: { Prefer: prefer }, body: JSON.stringify(row) });
export const update = (table, q, patch) =>
  call(`${table}?${q}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
export const remove = (table, q) => call(`${table}?${q}`, { method: "DELETE" });

// 학생 로그인 — 학생ID + 출결PIN. 세미나 앱과 **같은 방식**입니다.
export async function 학생찾기(studentId, pin) {
  const id = String(studentId ?? "").trim();
  const p = String(pin ?? "").trim();
  if (!id || !p) return null;
  const rows = await select(
    "students",
    `student_id=eq.${encodeURIComponent(id)}&pin=eq.${encodeURIComponent(p)}&select=student_id,name,status`
  );
  const s = rows?.[0];
  if (!s) return null;
  // 퇴원한 학생은 막습니다 (세미나 앱과 같은 규칙)
  if (s.status && s.status !== "재원") return null;
  return { student_id: s.student_id, name: s.name || "" };
}

// ── 비공개 저장소 (시험지 사진) ──────────────────────────
// ★ 버킷은 **public=false** 입니다. 주소를 알아도 못 엽니다.
//   볼 때마다 **짧은 시간짜리 주소**를 새로 만들어 줍니다 (아래 사진주소).
//   사진에는 아이 이름과 글씨가 있습니다 — 공개로 바꾸지 마세요.
const BUCKET = "vocab-shots";

export async function 사진올리기(path, base64, contentType = "image/jpeg") {
  주소점검();
  const bytes = Buffer.from(base64, "base64");
  const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    if (/Bucket not found/i.test(t)) {
      throw new Error("사진 저장소(vocab-shots)가 없습니다. `sql/vocab.sql` 을 한 번 돌려주세요.");
    }
    throw new Error(`사진을 못 올렸습니다 (${r.status}): ${t.slice(0, 150)}`);
  }
  return path;
}

// 볼 때만 쓰는 짧은 주소 (기본 10분)
export async function 사진주소(path, 초 = 600) {
  if (!path) return null;
  주소점검();
  const r = await fetch(`${URL_}/storage/v1/object/sign/${BUCKET}/${encodeURI(path)}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 초 }),
  });
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  return d?.signedURL ? `${URL_}/storage/v1${d.signedURL}` : null;
}

export async function 사진지우기(path) {
  if (!path) return;
  주소점검();
  await fetch(`${URL_}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
    method: "DELETE",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  }).catch(() => {});
}

// 학생 명단 — 사진 올릴 때 고르라고
export async function 학생들() {
  const rows = await select("students", "status=eq.재원&select=student_id,name&order=name.asc&limit=500");
  return rows ?? [];
}
