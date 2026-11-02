// 선생님 비밀번호 — 넣기 / 빼기 / 지금 들어와 있나.
//
//   POST {pass:"..."}  → 맞으면 쿠키를 줍니다
//   POST {out:true}    → 로그아웃
//   GET                → {locked, ok}  (화면이 처음에 물어봅니다)
import { 선생님인가, 잠금설정됨, 쪽지만들기, 쿠키헤더, 지우는쿠키 } from "../lib/auth.js";

export default function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ locked: 잠금설정됨(), ok: 선생님인가(req) });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "POST 로 보내주세요." });

  if (req.body?.out) {
    res.setHeader("Set-Cookie", 지우는쿠키);
    return res.status(200).json({ ok: false });
  }

  if (!잠금설정됨()) {
    return res.status(200).json({ ok: true, locked: false });
  }

  const pass = String(req.body?.pass ?? "");
  if (pass !== (process.env.TEACHER_PASS || "").trim()) {
    // 어느 쪽이 틀렸는지 알려주지 않습니다
    return res.status(401).json({ error: "비밀번호가 다릅니다." });
  }
  res.setHeader("Set-Cookie", 쿠키헤더(쪽지만들기()));
  return res.status(200).json({ ok: true, locked: true });
}
