ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_avatar_media_fk;
UPDATE user_profiles SET avatar_media_id = NULL;
DROP TABLE IF EXISTS media_assets;
