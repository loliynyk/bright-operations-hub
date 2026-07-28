-- Seed Bright 319 Google Form intake registration.
-- Idempotent on external_form_id (unique).
INSERT INTO public.lead_intake_forms (
  branch_id, service_id, requested_plan, external_form_id, external_sheet_id,
  source_form, secret_hash, field_mapping, is_active
)
SELECT
  b.id,
  (SELECT s.id FROM public.services s
    WHERE s.branch_id = b.id AND s.name ILIKE 'preschool' AND s.is_active
    LIMIT 1),
  'Full Day',
  '1377B2FAPo6LBDIvfoJwWxdnjkGBWfHsh37d_N8tuZQU',
  '1WTihyAksgs7KjNkHdH_wubSJBkr-k51s7NcEvHBN2Kk',
  'google_form_319',
  '__SET_ME__',
  jsonb_build_object(
    'Timestamp', 'submitted_at',
    'Ваше ім''я', 'parent_first_name',
    'Прізвище', 'parent_last_name',
    'Ім''я дитини', 'child_first_name',
    'Дата народження дитини', 'child_birthdate',
    'Вік дитини на даний момент', 'child_age',
    'В яку групу Ви хочете записати дитину', 'requested_group',
    'В якому районі Ви проживаєте; (населений пункт, вулиця)', 'parent_address',
    'Звідки Ви дізналися про наш садочок', 'referral_detail',
    'Чи відвідує дитина зараз дитячий навчальний заклад, та який саме', 'current_preschool',
    'З якої дати Ви плануєте відвідувати наш садок', 'desired_start_date',
    'Ваші побажання та додаткова інформація про дитину', 'notes',
    'Ваш телефон', 'parent_phone',
    'Ваш e-mail', 'parent_email'
  ),
  true
FROM public.branches b
WHERE b.name = 'Bright 319'
ON CONFLICT (external_form_id) DO NOTHING;