-- =========================================================
-- Graficad · Cotizador (tarifas y cotizaciones)
--
-- Cómo usarlo: en tu proyecto de Supabase entrá a "SQL Editor", pegá TODO
-- este archivo y apretá "Run". Se corre una sola vez, DESPUÉS de
-- database/instalar.sql. No toca ninguna tabla del curso.
-- =========================================================

-- Tarifas de corte y lista de materiales: una sola fila por empresa, en JSON,
-- para poder agregar materiales sin cambiar la base. Si no existe, la app usa
-- las tarifas por defecto (client/src/features/graficad/tarifas.ts).
create table graficad_tarifas (
  empresa_id uuid primary key references empresas (id) on delete cascade,
  datos jsonb not null,
  actualizado_en timestamptz not null default now()
);

create table graficad_cotizaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  -- Número correlativo que ve el cliente (COT-0001, COT-0002...).
  numero bigint generated always as identity,
  conversacion_id uuid references conversaciones (id) on delete set null,
  contacto_telefono text,
  cliente text not null,
  -- Todo el formulario (ítems, extras, factura) tal como se cotizó.
  datos jsonb not null,
  total numeric not null,
  estado text not null default 'borrador' check (estado in ('borrador', 'enviada', 'aprobada', 'rechazada')),
  creado_por uuid references usuarios (id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index graficad_cotizaciones_empresa_idx on graficad_cotizaciones (empresa_id, creado_en desc);

alter table graficad_tarifas enable row level security;
alter table graficad_cotizaciones enable row level security;

-- Todo el equipo lee las tarifas; solo supervisor y dueño las cambian.
create policy "graficad_tarifas_select" on graficad_tarifas for select
  using (empresa_id = (select empresa_id from usuario_actual()));

create policy "graficad_tarifas_admin" on graficad_tarifas for all
  using (
    empresa_id = (select empresa_id from usuario_actual())
    and (select rol from usuario_actual()) = any (array['supervisor', 'dueno']::rol_usuario[])
  )
  with check (
    empresa_id = (select empresa_id from usuario_actual())
    and (select rol from usuario_actual()) = any (array['supervisor', 'dueno']::rol_usuario[])
  );

-- Cualquiera del equipo cotiza; borrar solo supervisor y dueño.
create policy "graficad_cotizaciones_select" on graficad_cotizaciones for select
  using (empresa_id = (select empresa_id from usuario_actual()));

create policy "graficad_cotizaciones_insert" on graficad_cotizaciones for insert
  with check (empresa_id = (select empresa_id from usuario_actual()));

create policy "graficad_cotizaciones_update" on graficad_cotizaciones for update
  using (empresa_id = (select empresa_id from usuario_actual()))
  with check (empresa_id = (select empresa_id from usuario_actual()));

create policy "graficad_cotizaciones_delete" on graficad_cotizaciones for delete
  using (
    empresa_id = (select empresa_id from usuario_actual())
    and (select rol from usuario_actual()) = any (array['supervisor', 'dueno']::rol_usuario[])
  );
