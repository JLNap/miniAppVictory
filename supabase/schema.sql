-- Таблицы для комнат, игроков и чата викторины

-- Комнаты
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id bigint not null,
  category text not null,
  status text not null default 'waiting', -- waiting | playing | finished
  current_question_index int not null default 0,
  created_at timestamptz default now()
);

-- Игроки в комнате
create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  telegram_id bigint not null,
  username text,
  score int not null default 0,
  joined_at timestamptz default now(),
  unique(room_id, telegram_id)
);

-- Ответы игроков (для подсчёта очков и синхронизации)
create table if not exists public.room_answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  telegram_id bigint not null,
  question_index int not null,
  answer_index int not null,
  created_at timestamptz default now(),
  unique(room_id, telegram_id, question_index)
);

-- Чат комнаты
create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  telegram_id bigint not null,
  username text,
  message text not null,
  created_at timestamptz default now()
);

-- Индексы
create index if not exists idx_rooms_code on public.rooms(code);
create index if not exists idx_room_players_room on public.room_players(room_id);
create index if not exists idx_room_answers_room on public.room_answers(room_id);
create index if not exists idx_room_messages_room on public.room_messages(room_id);

-- RLS: разрешаем всем читать/писать (для Mini App без авторизации по email)
-- В продакшене можно ограничить по telegram_id через серверный API
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_answers enable row level security;
alter table public.room_messages enable row level security;

create policy "Allow all rooms" on public.rooms for all using (true) with check (true);
create policy "Allow all room_players" on public.room_players for all using (true) with check (true);
create policy "Allow all room_answers" on public.room_answers for all using (true) with check (true);
create policy "Allow all room_messages" on public.room_messages for all using (true) with check (true);

-- Realtime для комнат и чата (включить в Supabase Dashboard: Database -> Replication)
-- room_players, room_messages, rooms - включить realtime
