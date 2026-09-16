-- ============================================================
-- PLANETA SURF — Schema + seed (único SQL a ejecutar)
-- Ecommerce de ropa y accesorios, negocio único (sin multi-tenant).
-- Ejecutar entero en: Supabase → SQL Editor → Run
--
-- Después:
--   1. Storage → crear bucket "planeta-surf" (público, o con políticas
--      que permitan upload vía service key)
--   2. .env: SUPABASE_URL + SUPABASE_SERVICE_KEY + SUPABASE_STORAGE_BUCKET=planeta-surf
--   3. Admin: /admin — password inicial "admin123" (ver seed más abajo).
--      CAMBIALA apenas entres: el hash de "admin123" es público porque
--      está en este archivo. El seed usa ON CONFLICT DO NOTHING, así que
--      re-ejecutar este script entero es seguro y nunca pisa una
--      contraseña que ya hayas cambiado.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Negocio (fila única) + admin
-- ------------------------------------------------------------

create table if not exists business (
  id bigserial primary key,
  nombre text not null default 'Planeta Surf',
  direccion text not null default '',
  horario_texto text not null default '',
  instagram_url text not null default '',
  whatsapp_numero text not null default '',
  color_marca text not null default '#111111',
  logo_url text,
  hero_titulo text not null default 'TU ESTILO.\nTU PLANETA.',
  hero_subtitulo text not null default 'Ropa y accesorios para vivir tu día a tu manera.',
  hero_cta_primario_texto text not null default 'Ver colección',
  hero_cta_primario_link text not null default '/productos',
  hero_cta_secundario_texto text not null default 'Nuevos ingresos',
  hero_cta_secundario_link text not null default '/productos?orden=novedades',
  beneficio1_titulo text not null default 'Envíos en San Nicolás',
  beneficio1_subtitulo text not null default 'Coordinamos la entrega por WhatsApp',
  beneficio2_titulo text not null default '3 y 6 cuotas sin interés',
  beneficio2_subtitulo text not null default 'Con todas las tarjetas',
  beneficio3_titulo text not null default 'Compra 100% segura',
  beneficio3_subtitulo text not null default 'Protegemos tus datos',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_credentials (
  id bigserial primary key,
  password_salt text not null,
  password_hash text not null,
  password_salt_b text,
  password_hash_b text,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2) Categorías
-- ------------------------------------------------------------

create table if not exists categorias (
  id bigserial primary key,
  nombre text not null,
  slug text not null unique,
  imagen_url text,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3) Hero (galería de imágenes del carrusel principal)
-- ------------------------------------------------------------

create table if not exists hero_slides (
  id bigserial primary key,
  imagen_url text not null,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4) Productos
-- ------------------------------------------------------------

create table if not exists productos (
  id bigserial primary key,
  nombre text not null,
  descripcion text default '',
  precio numeric not null default 0,
  precio_promocional numeric,
  categoria_id bigint references categorias(id) on delete set null,
  imagen_principal text,
  imagenes_adicionales text[] not null default '{}',
  etiqueta text,
  destacado boolean not null default false,
  mostrar_en_home boolean not null default false,
  orden_home integer,
  activo boolean not null default true,
  disponible boolean not null default true,
  stock integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_productos_categoria on productos (categoria_id);
create index if not exists idx_productos_home on productos (mostrar_en_home, orden_home);

-- ------------------------------------------------------------
-- 5) RLS — deshabilitado, la seguridad vive en el middleware admin de
--    Express con la service key (igual que en la plataforma original).
-- ------------------------------------------------------------

alter table business disable row level security;
alter table admin_credentials disable row level security;
alter table categorias disable row level security;
alter table hero_slides disable row level security;
alter table productos disable row level security;

-- ------------------------------------------------------------
-- 6) Seed
-- ------------------------------------------------------------

insert into business (id, nombre, direccion, horario_texto, instagram_url, whatsapp_numero, color_marca)
values (
  1, 'Planeta Surf', 'Mitre 247 · Urquiza 31, San Nicolás de los Arroyos',
  'Mitre 247: 9 a 21 hs (corrido) · Urquiza 31: 8:30-12:30 y 16:30-20:30',
  'https://www.instagram.com/planetasurfshops/', '5493364294644', '#111111'
)
on conflict (id) do nothing;

-- Password inicial: admin123 (hash scrypt fijo, generado una sola vez).
-- IMPORTANTE: cambiala desde el panel admin apenas entres.
insert into admin_credentials (id, password_salt, password_hash)
values (
  1,
  'b63ee8722b3aa2eda857e965c85cce17',
  '940fd192f29e6d8aa21a58d9959006fc8491e80500062b1716d132a984f463c7acb17844a2bbf6afaaac7b252c3374179a51adb9dba0803fa1ebb4a2d2f8b8fb'
)
on conflict (id) do nothing;

insert into categorias (nombre, slug, orden, activo) values
  ('Surf', 'surf', 1, true),
  ('Remeras', 'remeras', 2, true),
  ('Musculosas', 'musculosas', 3, true),
  ('Shorts', 'shorts', 4, true)
on conflict (slug) do nothing;
