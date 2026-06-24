-- Be the Bee 온라인 대전 — 방 테이블 + 접근 규칙(RLS) + 실시간.
-- Supabase 대시보드 → SQL Editor → New query 에 붙여넣고 Run. (한 번만 실행)
-- 재실행 시 "already exists" 가 떠도 무시해도 됩니다.

-- 방 1개 = 한 행. 친구끼리 방 코드로 플레이하는 MVP(치팅 방지는 추후).
create table if not exists public.rooms (
  id          text primary key,                 -- 방 코드(짧은 랜덤 문자열)
  snapshot    text not null,                    -- 현재 판 상태(BTB1 직렬화 문자열)
  status      text not null default 'waiting',  -- waiting | playing | finished
  host_id     text not null,                    -- 방장 익명 클라이언트 id
  guest_id    text,                             -- 입장한 상대 익명 클라이언트 id
  host_side   text not null default 'yellow',   -- 방장 진영(yellow|brown)
  updated_at  timestamptz not null default now()
);

alter table public.rooms enable row level security;

-- MVP: 누구나 방 읽기/만들기/갱신(방 코드를 아는 사람끼리). 정교한 권한은 Phase 2.
drop policy if exists "rooms_select" on public.rooms;
drop policy if exists "rooms_insert" on public.rooms;
drop policy if exists "rooms_update" on public.rooms;
create policy "rooms_select" on public.rooms for select using (true);
create policy "rooms_insert" on public.rooms for insert with check (true);
create policy "rooms_update" on public.rooms for update using (true);

-- 실시간 구독(행 변경 푸시) 활성화. 이미 추가돼 있으면 에러가 떠도 무시.
alter publication supabase_realtime add table public.rooms;
