ALTER TABLE scores
  ADD COLUMN game_id VARCHAR(20) NOT NULL DEFAULT 'pipes' AFTER id,
  ADD COLUMN user_id INT NULL AFTER game_id,
  ADD INDEX idx_game_score (game_id, score DESC),
  ADD INDEX idx_user_game (user_id, game_id),
  ADD CONSTRAINT fk_scores_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
