-- ============================================================
-- 시험지 자동 채점 — 표 만들기
--
-- Supabase → SQL Editor → 새 쿼리 → 이 파일을 **통째로** 붙여넣고 Run.
-- 여러 번 돌려도 안전합니다 (if not exists).
--
-- ★ 학생 명단은 **새로 만들지 않습니다.** 세미나에서 만드신 `students` 표를
--   그대로 씁니다 (학생ID + 출결PIN 로 로그인). 명단을 두 벌 관리하면 반드시 어긋납니다.
--   → 그래서 이 앱의 SUPABASE_URL 은 **학원 시스템과 같은 프로젝트**를 가리켜야 합니다.
--
-- ★ RLS 를 켜고 **정책을 하나도 안 만듭니다.** = 브라우저에서는 아무것도 못 읽습니다.
--   읽고 쓰는 건 전부 서버(api/*.js)가 service_role 로 합니다.
--   정답이 브라우저로 새어 나가면 이 기능은 아무 쓸모가 없어서요.
-- ============================================================

-- ── 시험지 ────────────────────────────────────────────────
create table if not exists public.exams (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,                      -- 시험지 이름 (예: 2학기 중간 대비 1회)
  total       int  not null default 0,            -- 문항 수
  -- 문항: [{no, kind:'choice'|'essay', answers:[1,4], model, why, point}]
  --   answers = 객관식 정답 번호들 (복수 정답이면 여러 개)
  --   model   = 서술형 모범답안 · why = 해설(선택) · point = 배점
  items       jsonb not null default '[]',
  created_at  timestamptz not null default now()
);

-- ── 학생이 낸 답 ──────────────────────────────────────────
-- 한 학생이 한 시험지를 여러 번 볼 수 있습니다 (「처음부터 다시」).
-- ★ 지난 기록을 **지우지 않습니다** — 새 줄을 만듭니다. 늘어나는 걸 보는 게 공부입니다.
create table if not exists public.exam_tries (
  id          uuid primary key default gen_random_uuid(),
  exam_id     uuid not null references public.exams(id) on delete cascade,
  student_id  text not null,                      -- students.student_id 와 같은 값
  name        text,                               -- 그때의 이름 (나중에 바뀌어도 기록은 남게)
  first       jsonb not null default '{}',        -- 처음 낸 답   {"1":3,"2":[1,4],"7":"서술형 글"}
  second      jsonb not null default '{}',        -- 다시 푼 답 (틀린 것만)
  self        jsonb not null default '{}',        -- 서술형 자기채점 {"7":"ok"|"part"|"no"}
  wrong       int[] not null default '{}',        -- 처음에 틀린 번호
  fixed       int[] not null default '{}',        -- 다시 풀어 맞힌 번호 (점수엔 안 넣음)
  score       numeric,                            -- 점수 (다 끝나야 들어감)
  max_score   numeric,
  stage       text not null default 'first',      -- first → retry → done
  started_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists exam_tries_exam_idx on public.exam_tries(exam_id);
create index if not exists exam_tries_student_idx on public.exam_tries(student_id);

-- ── 잠그기 ────────────────────────────────────────────────
-- 정책을 안 만듭니다 = anon/authenticated 는 아무것도 못 합니다. 서버만 들어옵니다.
alter table public.exams enable row level security;
alter table public.exam_tries enable row level security;

-- ============================================================
-- 끝. 「Success. No rows returned」 가 뜨면 된 겁니다.
--
-- 확인: Table Editor 에 exams · exam_tries 두 개가 보이면 됩니다.
-- ============================================================
