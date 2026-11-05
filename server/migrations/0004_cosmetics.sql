CREATE TABLE IF NOT EXISTS cosmetics (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  art TEXT NOT NULL,
  season_id TEXT,
  earn TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_cosmetics (
  user_id TEXT NOT NULL,
  cosmetic_id TEXT NOT NULL,
  season_id TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  PRIMARY KEY (user_id, cosmetic_id)
);

INSERT OR IGNORE INTO cosmetics (id, kind, name, art, season_id, earn) VALUES
  ('oathbound_icon', 'icon', 'Oathbound', 'assets/portrait_aegis_knight.png', NULL, 'Founders profile icon'),
  ('imp_icon', 'icon', 'Dagger Imp', 'assets/portrait_dagger_imp.png', NULL, 'Founders profile icon'),
  ('brood_icon', 'icon', 'Brood Wisp', 'assets/portrait_brood_wisp.png', NULL, 'Founders profile icon'),
  ('ember_icon', 'icon', 'Ember Scout', 'assets/portrait_scout.png', 'season_2', 'Play during Emberwake'),
  ('founders_banner', 'banner', 'Founders March', 'assets/banner_victory.png', 'season_1', 'Play during Founders March'),
  ('emberwake_banner', 'banner', 'Emberwake', 'assets/banner_draft.png', 'season_2', 'Play during Emberwake'),
  ('warband_banner', 'banner', 'Warband', 'assets/bg_battlefield.png', NULL, 'Complete a run'),
  ('bronze_sigil', 'badge', 'Bronze Sigil', 'assets/frame_common.png', NULL, 'Reach 1400 ranked rating'),
  ('silver_sigil', 'badge', 'Silver Sigil', 'assets/frame_rare.png', NULL, 'Reach 1600 ranked rating'),
  ('gold_sigil', 'badge', 'Gold Sigil', 'assets/frame_mythic.png', NULL, 'Reach 1800 ranked rating'),
  ('season_1_trophy', 'trophy', 'Founders Trophy', 'assets/portrait_boss_warherald.png', 'season_1', 'Win level 20 in Founders March'),
  ('season_2_trophy', 'trophy', 'Emberwake Trophy', 'assets/portrait_boss_hivematron.png', 'season_2', 'Win level 20 in Emberwake');
