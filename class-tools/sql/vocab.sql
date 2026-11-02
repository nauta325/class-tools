-- ============================================================
-- 단어 시험지 사진 채점 — 표 만들기
--
-- Supabase → SQL Editor → 새 쿼리 → 이 파일을 **통째로** 붙여넣고 Run.
-- 여러 번 돌려도 안전합니다 (if not exists).
--
-- ★ 학생 명단은 **새로 만들지 않습니다.** 세미나에서 만드신 `students` 표를 그대로 씁니다.
--   그래서 이 앱의 SUPABASE_URL 은 **학원 시스템과 같은 프로젝트**를 가리켜야 합니다.
--
-- ★ RLS 를 켜고 **정책을 하나도 안 만듭니다** = 브라우저에서는 아무것도 못 읽습니다.
--   읽고 쓰는 건 전부 서버(api/*.js)가 service_role 로 합니다.
--   정답표가 새어 나가면 채점이 의미가 없고, 사진에는 아이 이름이 적혀 있습니다.
-- ============================================================

-- ── 정답표 ────────────────────────────────────────────────
-- 「교재 + Day + 뜻쓰기/스펠쓰기」마다 하나. 처음 채점할 때 한 번만 만듭니다.
create table if not exists public.vocab_keys (
  id         uuid primary key default gen_random_uuid(),
  book       text not null,                      -- 교재 이름
  day        text not null,                      -- Day(유닛) — 「03」 처럼 글자로 둡니다
  mode       text not null,                      -- 'meaning'(뜻 쓰기) | 'spell'(스펠 쓰기)
  -- [{no, word, meanings:[...]}]  뜻은 여러 개
  items      jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book, day, mode)
);

-- ── 채점 기록 ─────────────────────────────────────────────
create table if not exists public.vocab_scans (
  id          uuid primary key default gen_random_uuid(),
  key_id      uuid references public.vocab_keys(id) on delete set null,
  student_id  text,                              -- students.student_id
  name        text,                              -- 그때의 이름 (나중에 바뀌어도 기록은 남게)
  image_path  text,                              -- 비공개 저장소 안의 경로 (주소가 아닙니다)
  book        text, day text, mode text,
  -- [{no, printed, written, key, mark:'ok'|'no'|'q'|'blank', fixed:bool}]
  items       jsonb not null default '[]',
  total       int  not null default 0,
  wrong       int  not null default 0,
  score_text  text,                              -- 「-3/20」 또는 「100」
  status      text not null default 'pending',   -- pending → pass | retest
  no_key      boolean not null default false,    -- 정답표 없이 채점했나
  created_at  timestamptz not null default now(),
  graded_at   timestamptz,
  confirmed_at timestamptz
);

create index if not exists vocab_scans_day_idx on public.vocab_scans(created_at desc);
create index if not exists vocab_scans_student_idx on public.vocab_scans(student_id);
create index if not exists vocab_scans_status_idx on public.vocab_scans(status);

alter table public.vocab_keys  enable row level security;
alter table public.vocab_scans enable row level security;

-- ── 사진 넣을 **비공개** 저장소 ───────────────────────────
-- public=false 입니다. 주소를 알아도 못 엽니다 —
-- 볼 때마다 서버가 **짧은 시간짜리 주소**를 새로 만들어 줍니다.
insert into storage.buckets (id, name, public)
values ('vocab-shots', 'vocab-shots', false)
on conflict (id) do nothing;

-- ============================================================
-- 끝. 「Success. No rows returned」 가 뜨면 된 겁니다.
--
-- 확인 두 가지
--   · Table Editor 에 vocab_keys · vocab_scans 가 보이나
--   · Storage 에 vocab-shots 가 있고 **Public 이 꺼져** 있나
-- ============================================================
