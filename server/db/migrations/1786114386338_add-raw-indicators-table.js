/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createTable('raw_indicators', {
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
    source: { type: 'text', notNull: true },
    indicator_code: { type: 'text', notNull: true },
    indicator_name: { type: 'text', notNull: true },
    value: { type: 'numeric' },
    unit: { type: 'text' },
    year: { type: 'integer', notNull: true },
    fetched_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    data_url: { type: 'text' },
  });

  pgm.addConstraint('raw_indicators', 'raw_indicators_geography_source_code_year_uidx', {
    unique: ['geography_id', 'source', 'indicator_code', 'year'],
  });

  pgm.createIndex('raw_indicators', 'geography_id', {
    name: 'raw_indicators_geography_idx',
  });
  pgm.createIndex('raw_indicators', 'source', {
    name: 'raw_indicators_source_idx',
  });
  pgm.createIndex('raw_indicators', 'indicator_code', {
    name: 'raw_indicators_indicator_code_idx',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable('raw_indicators');
};
