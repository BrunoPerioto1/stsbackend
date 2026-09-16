-- Dashboard e listagem filtram/ordenam por coalesce(event_start_at, bet_time)
-- (ver bet-date.ts); idx_bets_bet_time não serve pra essa expressão.
-- A expressão aqui tem que ser idêntica à do betDate pro planner casar.
CREATE INDEX IF NOT EXISTS idx_bets_user_bet_date ON bets (user_id, (coalesce(event_start_at, bet_time)));
