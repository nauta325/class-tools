-- ============================================================
-- 🎙 선생님 목소리 카드 강의 — 「끝까지 들은 카드」 표
--
-- Supabase → SQL Editor → 새 쿼리 → 이 파일을 **통째로** 붙여넣고 Run.
-- 여러 번 돌려도 안전합니다 (if not exists).
--
-- ★ 강의 내용(대본·판서·mp3)은 DB 에 안 넣습니다 — **파일**입니다
--   (lecture-data/ · lecture-audio/). DB 에는 「누가 어느 카드를 끝까지 들었나」만.
--   그래서 강의를 고쳐도 아이들 진도가 안 날아갑니다.
--
-- ★ 학생 명단은 **새로 만들지 않습니다.** 세미나에서 만드신 `students` 표를 그대로 씁니다.
--
-- ★ RLS 를 켜고 정책을 하나도 안 만듭니다 = 브라우저에서 직접 못 읽습니다.
--   읽고 쓰는 건 전부 서버(api/lecture.js)가 합니다.
-- ============================================================

create table if not exists public.lecture_heard (
  student_id text not null,                  -- students.student_id
  unit       text not null,                  -- 단원 («u01» 같은 폴더 이름)
  card       int  not null,                  -- 몇 번째 카드 (1부터)
  created_at timestamptz not null default now(),
  -- 같은 카드를 여러 번 들어도 한 줄만 (처음 끝까지 들은 때가 남습니다)
  unique (student_id, unit, card)
);

create index if not exists lecture_heard_unit_idx on public.lecture_heard(unit);
create index if not exists lecture_heard_student_idx on public.lecture_heard(student_id);

alter table public.lecture_heard enable row level security;

-- ============================================================
-- 끝. 「Success. No rows returned」 가 뜨면 된 겁니다.
-- 확인: Table Editor 에 lecture_heard 가 보이나
-- ============================================================
