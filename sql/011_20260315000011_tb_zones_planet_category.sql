alter table public.tb_zones
  add column if not exists planet_category text;

alter table public.tb_zones
  add constraint tb_zones_planet_category_check
  check (planet_category in ('LS', 'DS', 'MIX', 'SPECIAL'));