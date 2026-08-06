/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createTable('agents', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    user_id: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
    name: { type: 'varchar(255)', notNull: true },
    company: { type: 'varchar(255)' },
    category: {
      type: 'varchar(50)',
      notNull: true,
      check: "category IN ('commercial_real_estate', 'permitting_compliance', 'legal_counsel', 'supply_chain_3pl', 'workforce_recruiting')",
    },
    geography_ids: { type: 'uuid[]' },
    coverage_areas: { type: 'geometry(MultiPolygon, 4326)' },
    verified: { type: 'boolean', notNull: true, default: false },
    rating: {
      type: 'numeric(3,2)',
      default: 0,
      check: 'rating >= 0 AND rating <= 5',
    },
    engagement_count: { type: 'integer', notNull: true, default: 0 },
    response_time: { type: 'varchar(20)' },
    specializations: { type: 'jsonb' },
    bio: { type: 'text' },
    website: { type: 'varchar(500)' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('agents', 'coverage_areas', {
    name: 'agents_coverage_areas_gix',
    method: 'gist',
  });
  pgm.createIndex('agents', 'category', { name: 'agents_category_idx' });
  pgm.createIndex('agents', 'verified', { name: 'agents_verified_idx' });
  pgm.createIndex('agents', 'rating', { name: 'agents_rating_idx' });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable('agents');
};
