/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * Fix string defaults that were stored as quoted literals (e.g. `'free'`).
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
      ALTER COLUMN subscription_tier SET DEFAULT 'free';

    ALTER TABLE mvi_scores
      ALTER COLUMN industry_vertical SET DEFAULT 'all',
      ALTER COLUMN confidence SET DEFAULT 'low';
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
      ALTER COLUMN subscription_tier SET DEFAULT '''free''';

    ALTER TABLE mvi_scores
      ALTER COLUMN industry_vertical SET DEFAULT '''all''',
      ALTER COLUMN confidence SET DEFAULT '''low''';
  `);
};
