/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createTable('mvi_scores', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    geography_id: {
      type: 'uuid',
      notNull: true,
      references: 'geographies',
      onDelete: 'CASCADE',
    },
    industry_vertical: {
      type: 'varchar(50)',
      notNull: true,
      default: 'all',
    },
    overall_score: {
      type: 'numeric(5,2)',
      notNull: true,
      check: 'overall_score >= 0 AND overall_score <= 100',
    },
    dimensions: { type: 'jsonb', notNull: true },
    confidence: {
      type: 'varchar(10)',
      notNull: true,
      default: 'low',
      check: "confidence IN ('high', 'medium', 'low')",
    },
    data_freshness: { type: 'timestamptz' },
    sources: { type: 'jsonb' },
    calculated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('mvi_scores', ['geography_id', 'industry_vertical'], {
    name: 'mvi_scores_geography_id_industry_vertical_uidx',
    unique: true,
  });
  pgm.createIndex('mvi_scores', 'overall_score', {
    name: 'mvi_scores_overall_score_idx',
  });
  pgm.createIndex('mvi_scores', 'industry_vertical', {
    name: 'mvi_scores_industry_vertical_idx',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable('mvi_scores');
};
