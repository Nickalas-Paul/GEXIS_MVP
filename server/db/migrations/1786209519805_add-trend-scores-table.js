/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createTable('trend_scores', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    geography_id: {
      type: 'uuid',
      notNull: true,
      references: 'geographies',
      onDelete: 'CASCADE',
    },
    dimension: { type: 'text', notNull: true },
    direction: { type: 'text', notNull: true },
    annualized_rate: { type: 'numeric' },
    acceleration: { type: 'numeric' },
    current_score: { type: 'numeric' },
    projected_2yr: { type: 'numeric' },
    projected_5yr: { type: 'numeric' },
    confidence_lower_2yr: { type: 'numeric' },
    confidence_upper_2yr: { type: 'numeric' },
    confidence_lower_5yr: { type: 'numeric' },
    confidence_upper_5yr: { type: 'numeric' },
    trend_confidence: { type: 'text', notNull: true },
    data_points: { type: 'integer', notNull: true },
    year_range_start: { type: 'integer' },
    year_range_end: { type: 'integer' },
    computed_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('trend_scores', 'trend_scores_direction_check', {
    check: "direction IN ('improving', 'declining', 'stable')",
  });
  pgm.addConstraint('trend_scores', 'trend_scores_trend_confidence_check', {
    check: "trend_confidence IN ('high', 'medium', 'low')",
  });
  pgm.addConstraint('trend_scores', 'trend_scores_geography_dimension_uidx', {
    unique: ['geography_id', 'dimension'],
  });

  pgm.createIndex('trend_scores', 'geography_id', {
    name: 'idx_trend_scores_geography',
  });
  pgm.createIndex('trend_scores', 'dimension', {
    name: 'idx_trend_scores_dimension',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable('trend_scores');
};
