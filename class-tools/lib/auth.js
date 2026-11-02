// 선생님 화면 잠그기 — 비밀번호 하나.
//
// 왜 이렇게 단순한가: 이 앱은 **학원 한 곳**이 씁니다. 계정·가입·비밀번호 찾기까지
// 만들면 쓰는 사람이 더 어려워집니다. 환경변수 하나로 잠그고, 틀리면 못 들어옵니다.
//
// 어떻게: 비밀번호가 맞으면 **서명한 쪽지**를 쿠키로 줍니다.
//   쪽지 = <만료시각>.<서명>   · 서명 = sha256(비밀번호 + 만료시각)
//   비밀번호 자체는 쿠키에 **안 들어갑니다.** 서명을 다시 계산해 맞는지만 봅니다.
//   비밀번호를 바꾸면 전에 준 쪽지는 전부 무효가 됩니다 (서명이 안 맞으므로).
//
// ⚠️ 솔직히: 비밀번호 하나를 여러 선생님이 나눠 쓰는 방식입니다.
//   누가 무엇을 했는지는 남지 않습니다. 그 이상이 필요하면 로그인을 따로 붙이세요.

import crypto from "node:crypto";

const 하루 = 24 * 60 * 60 * 1000;
const 유효 = 14 * 하루; // 2주에 한 번만 다시 입력

export const COOKIE = "ct_teacher";

function 비번() {
  return (process.env.TEACHER_PASS || "").trim();
}

export function 잠금설정됨() {
  return Boolean(비번());
}

function 서명(만료) {
  return crypto.createHash("sha256").update(비번() + "." + 만료).digest("hex").slice(0, 32);
}

export function 쪽지만들기() {
  const 만료 = Date.now() + 유효;
  return `${만료}.${서명(만료)}`;
}

export function 쪽지맞나(쪽지) {
  const [만료, sig] = String(쪽지 || "").split(".");
  if (!만료 || !sig) return false;
  if (Number(만료) < Date.now()) return false;
  const 맞는것 = 서명(만료);
  // 길이가 다르면 timingSafeEqual 이 던집니다 — 먼저 봅니다.
  if (sig.length !== 맞는것.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(맞는것));
}

function 쿠키읽기(req, 이름) {
  const raw = req.headers?.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === 이름) return decodeURIComponent(v.join("="));
  }
  return "";
}

// 선생님인가. 아니면 false 를 돌려주고, 부르는 쪽에서 401 을 냅니다.
export function 선생님인가(req) {
  // ★ 비밀번호를 안 넣어두면 **잠기지 않습니다.**
  //   처음 배포하고 바로 써보시라고 이렇게 뒀습니다 — 대신 화면이 크게 알려줍니다.
  if (!잠금설정됨()) return true;
  return 쪽지맞나(쿠키읽기(req, COOKIE));
}

export function 쿠키헤더(쪽지) {
  const 초 = Math.floor(유효 / 1000);
  // Secure 는 Vercel(https)에서 늘 붙습니다. SameSite=Lax 로 다른 사이트에서 못 쓰게.
  return `${COOKIE}=${encodeURIComponent(쪽지)}; Path=/; Max-Age=${초}; HttpOnly; SameSite=Lax; Secure`;
}

export const 지우는쿠키 = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`;
