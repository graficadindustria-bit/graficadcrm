-- =========================================================
-- Actualizar la base de datos del CRM (versión 6)
--
-- Cuándo usarlo: cada vez que el profe avise que hay mejoras nuevas y vos
-- hiciste "Sync fork". Pegá TODO este archivo en el SQL Editor de tu Supabase
-- y apretá "Run". Es seguro correrlo más de una vez: lo que ya está hecho
-- no se vuelve a hacer ni se rompe nada.
--
-- Si no lo corrés, el CRM te va a mostrar un aviso arriba diciendo que tu
-- base está atrasada, y algunas pantallas nuevas no van a funcionar.
--
-- Qué trae esta versión:
--   * cierre automático de chats sin respuesta
--   * probabilidad por etapa del embudo y motivos de venta perdida
--   * campos propios, folio y documentos en la ficha del cliente
--   * mensajes programados con archivos adjuntos
--   * agenda con actividades y checklist armadas por el gerente
--   * varias oportunidades por contacto, con historial de ganadas y perdidas
-- =========================================================

-- ---------- 1. Cierre automático de chats ----------
-- Si el último mensaje es del vendedor y el cliente no contestó en X horas,
-- el chat se cierra solo. NULL = apagado.
alter table empresas
  add column if not exists cierre_auto_horas integer
  check (cierre_auto_horas is null or cierre_auto_horas between 1 and 720);

-- ---------- 2. Probabilidad por etapa y motivos de venta perdida ----------
alter table etapas_venta
  add column if not exists probabilidad smallint check (probabilidad between 0 and 100);

update etapas_venta set probabilidad = 100 where tipo = 'ganada' and probabilidad is null;
update etapas_venta set probabilidad = 0 where tipo = 'perdida' and probabilidad is null;
update etapas_venta e set probabilidad = least(10 + (r.rn - 1) * 30, 90)
from (
  select id, row_number() over (partition by empresa_id order by orden) as rn
  from etapas_venta where tipo = 'normal'
) r
where e.id = r.id and e.probabilidad is null;

create table if not exists motivos_perdida (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  nombre text not null,
  creado_en timestamptz not null default now()
);

alter table motivos_perdida enable row level security;

drop policy if exists "motivos_perdida_select" on motivos_perdida;
create policy "motivos_perdida_select" on motivos_perdida for select
  using (empresa_id = (select empresa_id from usuario_actual()));

drop policy if exists "motivos_perdida_admin" on motivos_perdida;
create policy "motivos_perdida_admin" on motivos_perdida for all
  using (
    empresa_id = (select empresa_id from usuario_actual())
    and (select rol from usuario_actual()) = any (array['supervisor', 'dueno']::rol_usuario[])
  )
  with check (
    empresa_id = (select empresa_id from usuario_actual())
    and (select rol from usuario_actual()) = any (array['supervisor', 'dueno']::rol_usuario[])
  );

-- Motivos por defecto para las empresas que todavía no tienen ninguno.
insert into motivos_perdida (empresa_id, nombre)
select e.id, m.nombre
from empresas e
cross join (values ('Precio'), ('Eligió a la competencia'), ('Dejó de responder'), ('No era el momento'), ('Otro')) as m(nombre)
where not exists (select 1 from motivos_perdida mp where mp.empresa_id = e.id);

alter table contactos
  add column if not exists motivo_perdida_id uuid references motivos_perdida (id) on delete set null;

-- Una empresa nueva nace con sus 4 etapas (con probabilidad) y sus motivos.
create or replace function empresas_crear_etapas() returns trigger as $$
begin
  insert into etapas_venta (empresa_id, nombre, tipo, orden, probabilidad) values
    (new.id, 'Primer Contacto', 'normal', 1, 10),
    (new.id, 'En Negociación', 'normal', 2, 40),
    (new.id, 'Venta Ganada', 'ganada', 3, 100),
    (new.id, 'Venta Perdida', 'perdida', 4, 0);
  insert into motivos_perdida (empresa_id, nombre)
    select new.id, m from unnest(array['Precio', 'Eligió a la competencia', 'Dejó de responder', 'No era el momento', 'Otro']) as m;
  return new;
end;
$$ language plpgsql;

-- ---------- 3. Ficha de cliente personalizable ----------
-- Campos propios por empresa (ej. gas: placa, modelo, precio), folio del
-- cliente y documentos adjuntos (foto del carnet, contratos...).
alter table contactos add column if not exists folio text;

create table if not exists campos_personalizados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  nombre text not null,
  tipo text not null default 'texto' check (tipo in ('texto', 'numero', 'fecha', 'seleccion', 'casilla')),
  -- Solo para tipo 'seleccion': lista de opciones.
  opciones jsonb not null default '[]'::jsonb,
  orden int not null default 0,
  creado_en timestamptz not null default now()
);

create table if not exists contacto_campos (
  contacto_id uuid not null references contactos (id) on delete cascade,
  campo_id uuid not null references campos_personalizados (id) on delete cascade,
  valor text,
  primary key (contacto_id, campo_id)
);

create table if not exists contacto_documentos (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid not null references contactos (id) on delete cascade,
  nombre text not null,
  ruta text not null,
  url text not null,
  tamano bigint,
  subido_por uuid references usuarios (id) on delete set null,
  creado_en timestamptz not null default now()
);
create index if not exists contacto_documentos_contacto_idx on contacto_documentos (contacto_id);

alter table campos_personalizados enable row level security;
alter table contacto_campos enable row level security;
alter table contacto_documentos enable row level security;

drop policy if exists "campos_personalizados_select" on campos_personalizados;
create policy "campos_personalizados_select" on campos_personalizados for select
  using (empresa_id = (select empresa_id from usuario_actual()));

drop policy if exists "campos_personalizados_admin" on campos_personalizados;
create policy "campos_personalizados_admin" on campos_personalizados for all
  using (
    empresa_id = (select empresa_id from usuario_actual())
    and (select rol from usuario_actual()) = any (array['supervisor', 'dueno']::rol_usuario[])
  )
  with check (
    empresa_id = (select empresa_id from usuario_actual())
    and (select rol from usuario_actual()) = any (array['supervisor', 'dueno']::rol_usuario[])
  );

-- Quien puede ver un contacto (la policy de `contactos` ya filtra por empresa
-- y por línea del vendedor) puede ver y editar sus campos y documentos.
drop policy if exists "contacto_campos_todo" on contacto_campos;
create policy "contacto_campos_todo" on contacto_campos for all
  using (contacto_id in (select id from contactos))
  with check (contacto_id in (select id from contactos));

drop policy if exists "contacto_documentos_todo" on contacto_documentos;
create policy "contacto_documentos_todo" on contacto_documentos for all
  using (contacto_id in (select id from contactos))
  with check (contacto_id in (select id from contactos));

-- Los documentos viven en el bucket `media` bajo documentos/<empresa>/<contacto>/.
-- Solo los usuarios de esa empresa pueden borrarlos.
drop policy if exists "media_borrado_documentos_empresa" on storage.objects;
create policy "media_borrado_documentos_empresa"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'media'
  and name like 'documentos/' || (select empresa_id::text from usuario_actual()) || '/%'
);

-- ---------- 4. Mensajes programados con archivos adjuntos ----------
-- `contenido` pasa a ser el texto, la leyenda de la imagen o el nombre del archivo.
alter table mensajes_programados
  add column if not exists tipo text not null default 'texto'
    check (tipo in ('texto', 'imagen', 'pdf', 'documento', 'audio')),
  add column if not exists media_url text,
  add column if not exists mimetype text;

-- ---------- 5. Agenda armada por el gerente ----------
-- Una tarea ya no tiene que estar atada a un cliente: el dueño o un supervisor
-- puede dejarle al vendedor una actividad con una nota y un checklist.
alter table tareas alter column contacto_id drop not null;
alter table tareas add column if not exists descripcion text;
alter table tareas add column if not exists creado_por uuid references usuarios (id) on delete set null;

create table if not exists tarea_items (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references tareas (id) on delete cascade,
  texto text not null,
  hecho boolean not null default false,
  orden int not null default 0
);
create index if not exists tarea_items_tarea_idx on tarea_items (tarea_id);

alter table tarea_items enable row level security;

drop policy if exists "tarea_items_todo" on tarea_items;
create policy "tarea_items_todo" on tarea_items for all
  using (tarea_id in (select id from tareas))
  with check (tarea_id in (select id from tareas));

-- Para que la Agenda se refresque sola cuando alguien marca un ítem.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tarea_items'
  ) then
    alter publication supabase_realtime add table tarea_items;
  end if;
end $$;

-- ---------- 6. Oportunidades por contacto, con historial ----------
-- Un contacto puede tener varias oportunidades (abiertas, ganadas o perdidas).
-- contactos.valor_estimado y contactos.probabilidad_cierre siguen existiendo:
-- un trigger los recalcula solo cada vez que cambia una oportunidad.
create table if not exists oportunidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  contacto_id uuid not null references contactos (id) on delete cascade,
  producto text,
  monto numeric not null default 0 check (monto >= 0),
  probabilidad smallint not null default 0 check (probabilidad between 0 and 100),
  estado text not null default 'abierta' check (estado in ('abierta', 'ganada', 'perdida')),
  motivo_perdida_id uuid references motivos_perdida (id) on delete set null,
  nota text,
  creado_por uuid references usuarios (id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  cerrada_en timestamptz
);
create index if not exists oportunidades_contacto_idx on oportunidades (contacto_id);
create index if not exists oportunidades_empresa_estado_idx on oportunidades (empresa_id, estado);

alter table oportunidades enable row level security;

-- Quien puede ver un contacto (la policy de `contactos` ya filtra por empresa y
-- por línea del vendedor) puede ver y trabajar sus oportunidades.
drop policy if exists "oportunidades_todo" on oportunidades;
create policy "oportunidades_todo" on oportunidades for all
  using (contacto_id in (select id from contactos))
  with check (
    empresa_id = (select empresa_id from usuario_actual())
    and contacto_id in (select id from contactos)
  );

-- Mantiene al día los totales del contacto que leen el Embudo, Hoy y Reportes:
--  * valor_estimado = suma de las oportunidades abiertas y ganadas;
--  * probabilidad_cierre = la mayor de las abiertas (100 si solo hay ganadas).
create or replace function oportunidades_sincronizar_contacto() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cid uuid := coalesce(new.contacto_id, old.contacto_id);
begin
  update contactos c set
    valor_estimado = (select sum(monto) from oportunidades where contacto_id = cid and estado in ('abierta', 'ganada')),
    probabilidad_cierre = coalesce(
      (select max(probabilidad) from oportunidades where contacto_id = cid and estado = 'abierta'),
      case when exists (select 1 from oportunidades where contacto_id = cid and estado = 'ganada') then 100 end
    ),
    actualizado_en = now()
  where c.id = cid;
  return null;
end;
$$;

drop trigger if exists oportunidades_sincronizar on oportunidades;
create trigger oportunidades_sincronizar
  after insert or update or delete on oportunidades
  for each row execute function oportunidades_sincronizar_contacto();

-- Pasa lo que ya existía en `contactos` a la nueva tabla (una sola vez).
insert into oportunidades (empresa_id, contacto_id, producto, monto, probabilidad, estado, motivo_perdida_id, creado_en, actualizado_en, cerrada_en)
select
  c.empresa_id,
  c.id,
  c.producto_interes,
  coalesce(c.valor_estimado, 0),
  coalesce(c.probabilidad_cierre, 0),
  case e.tipo when 'ganada' then 'ganada' when 'perdida' then 'perdida' else 'abierta' end,
  c.motivo_perdida_id,
  c.creado_en,
  c.actualizado_en,
  case when e.tipo in ('ganada', 'perdida') then coalesce(c.etapa_actualizada_en, c.actualizado_en) end
from contactos c
left join etapas_venta e on e.id = c.etapa_id
where not exists (select 1 from oportunidades o where o.contacto_id = c.id)
  and (
    coalesce(c.valor_estimado, 0) > 0
    or coalesce(c.probabilidad_cierre, 0) > 0
    or c.temperatura = 'caliente'
    or e.tipo in ('ganada', 'perdida')
  );

do $$
begin
  alter publication supabase_realtime add table oportunidades;
exception when duplicate_object then null;
end $$;

-- ---------- 7. Versión de la base ----------
-- El CRM la lee para avisarte si te falta correr esta actualización.
create table if not exists esquema_version (
  id int primary key default 1 check (id = 1),
  version int not null,
  actualizado_en timestamptz not null default now()
);

alter table esquema_version enable row level security;

drop policy if exists "esquema_version_select" on esquema_version;
create policy "esquema_version_select" on esquema_version for select
  to authenticated using (true);

insert into esquema_version (id, version) values (1, 6)
on conflict (id) do update
  set version = greatest(esquema_version.version, excluded.version),
      actualizado_en = now();
