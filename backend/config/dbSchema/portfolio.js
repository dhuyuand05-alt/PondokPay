export const ensurePortfolioSchema = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portfolio_admin (
      id TINYINT UNSIGNED PRIMARY KEY,
      password_hash VARCHAR(60) NOT NULL,
      token_version INT UNSIGNED NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT chk_portfolio_admin_singleton CHECK (id = 1)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portfolio_content (
      id TINYINT UNSIGNED PRIMARY KEY,
      content JSON NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT chk_portfolio_content_singleton CHECK (id = 1)
    ) ENGINE=InnoDB
  `);
};
