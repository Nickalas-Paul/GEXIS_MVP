/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * Allow NULL overall_score when fewer than 3 dimensions have data.
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.alterColumn('mvi_scores', 'overall_score', {
    notNull: false,
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql(`
    UPDATE mvi_scores
    SET overall_score = 0
    WHERE overall_score IS NULL
  `);
  pgm.alterColumn('mvi_scores', 'overall_score', {
    notNull: true,
  });
};
