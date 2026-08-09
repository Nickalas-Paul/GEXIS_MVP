/**
 * Phase 7.5 Step 4: market_signals table for Layer 2 real-time signals.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE market_signals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      geography_id UUID REFERENCES geographies(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      signal_type TEXT NOT NULL CHECK (signal_type IN (
        'tariff_risk',
        'sanctions',
        'trade_agreement',
        'regulatory_change',
        'political_instability',
        'currency_crisis',
        'natural_disaster',
        'economic_policy',
        'labor_unrest',
        'infrastructure_event'
      )),
      title TEXT NOT NULL,
      description TEXT,
      probability NUMERIC CHECK (probability >= 0 AND probability <= 1),
      severity INTEGER CHECK (severity >= 1 AND severity <= 5),
      direction TEXT NOT NULL CHECK (direction IN ('positive', 'negative', 'neutral')),
      affected_dimensions TEXT[] NOT NULL DEFAULT '{}',
      event_url TEXT,
      resolved BOOLEAN NOT NULL DEFAULT false,
      resolved_outcome TEXT,
      expires_at TIMESTAMPTZ,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_market_signals_geography ON market_signals(geography_id);
    CREATE INDEX idx_market_signals_active ON market_signals(resolved, expires_at) WHERE resolved = false;
    CREATE INDEX idx_market_signals_source ON market_signals(source);
    CREATE INDEX idx_market_signals_type ON market_signals(signal_type);
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_market_signals_type`);
  pgm.sql(`DROP INDEX IF EXISTS idx_market_signals_source`);
  pgm.sql(`DROP INDEX IF EXISTS idx_market_signals_active`);
  pgm.sql(`DROP INDEX IF EXISTS idx_market_signals_geography`);
  pgm.sql(`DROP TABLE IF EXISTS market_signals`);
};
