ALTER TABLE models ADD COLUMN country TEXT;
ALTER TABLE models ADD COLUMN official_profile_url TEXT;
ALTER TABLE models ADD COLUMN official_x_url TEXT;
ALTER TABLE models ADD COLUMN official_instagram_url TEXT;
ALTER TABLE models ADD COLUMN official_youtube_url TEXT;
ALTER TABLE models ADD COLUMN official_tiktok_url TEXT;
ALTER TABLE models ADD COLUMN image_rights_status TEXT;
ALTER TABLE models ADD COLUMN source_checked_at TEXT;

INSERT INTO models (
  id,
  display_name,
  category,
  base_recommendations,
  is_demo,
  status,
  country,
  official_profile_url,
  official_x_url,
  official_instagram_url,
  official_youtube_url,
  official_tiktok_url,
  image_rights_status,
  source_checked_at
) VALUES
  (
    'enako', 'Enako', 'cosplay', 0, 0, 'active', 'Japan',
    'https://ppe.jp/talent/enako/',
    'https://twitter.com/enako_cos',
    'https://www.instagram.com/enakorin/',
    'https://www.youtube.com/channel/UCrUdiKv9LERZmG_MKh63Xgg',
    NULL,
    'no_image_official_links_only', '2026-08-01'
  ),
  (
    'umi-shinonome', 'Umi Shinonome', 'gravure', 0, 0, 'active', 'Japan',
    'https://ppe.jp/talent/umi-shinonome/',
    'https://twitter.com/sinonome_umi',
    'https://www.instagram.com/umi_portrait/',
    'https://www.youtube.com/channel/UCLnac6g3R8YcGOisZxsVIpw',
    NULL,
    'no_image_official_links_only', '2026-08-01'
  ),
  (
    'nashiko-momotsuki', 'Nashiko Momotsuki', 'cosplay', 0, 0, 'active', 'Japan',
    'https://official.01familia.jp/talent/nashiko',
    NULL, NULL, NULL, NULL,
    'no_image_official_links_only', '2026-08-01'
  ),
  (
    'ai-shinozaki', 'Ai Shinozaki', 'gravure', 0, 0, 'active', 'Japan',
    'https://shinozakiai0226.com/',
    'https://twitter.com/shinozakiai_226',
    'https://www.instagram.com/shinopp._.ai/',
    'https://www.youtube.com/channel/UCKiLOWcSyFZjRLAY1IsZzjA',
    NULL,
    'no_image_official_links_only', '2026-08-01'
  ),
  (
    'kiko-mizuhara', 'Kiko Mizuhara', 'model', 0, 0, 'active', 'Japan',
    'https://kiko-mizuhara.com/',
    NULL,
    'https://www.instagram.com/i_am_kiko/',
    NULL, NULL,
    'no_image_official_links_only', '2026-08-01'
  ),
  (
    'elaiza-ikeda', 'Elaiza Ikeda', 'model', 0, 0, 'active', 'Japan',
    'https://www.evergreen-e.com/feature/ikeda_elaiza',
    NULL,
    'https://www.instagram.com/elaiza_ikd/',
    NULL,
    'https://www.tiktok.com/@elaizaofficial_',
    'no_image_official_links_only', '2026-08-01'
  )
ON CONFLICT(id) DO UPDATE SET
  display_name = excluded.display_name,
  category = excluded.category,
  base_recommendations = excluded.base_recommendations,
  is_demo = excluded.is_demo,
  status = excluded.status,
  country = excluded.country,
  official_profile_url = excluded.official_profile_url,
  official_x_url = excluded.official_x_url,
  official_instagram_url = excluded.official_instagram_url,
  official_youtube_url = excluded.official_youtube_url,
  official_tiktok_url = excluded.official_tiktok_url,
  image_rights_status = excluded.image_rights_status,
  source_checked_at = excluded.source_checked_at,
  updated_at = CURRENT_TIMESTAMP;
