/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createTable('geographies', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    name: { type: 'varchar(255)', notNull: true },
    iso_code: { type: 'varchar(10)' },
    region_type: {
      type: 'varchar(20)',
      notNull: true,
      check: "region_type IN ('country', 'state', 'metro', 'municipality')",
    },
    parent_geography_id: {
      type: 'uuid',
      references: 'geographies',
      onDelete: 'SET NULL',
    },
    region_label: { type: 'varchar(100)' },
    geometry: { type: 'geometry(MultiPolygon, 4326)' },
    centroid: { type: 'geometry(Point, 4326)' },
    bbox: { type: 'box2d' },
    population: { type: 'bigint' },
    gdp_ppp: { type: 'numeric(15,2)' },
    currency_code: { type: 'varchar(3)' },
    language_primary: { type: 'varchar(50)' },
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

  pgm.createIndex('geographies', 'geometry', {
    name: 'geographies_geometry_gix',
    method: 'gist',
  });
  pgm.createIndex('geographies', 'centroid', {
    name: 'geographies_centroid_gix',
    method: 'gist',
  });
  pgm.createIndex('geographies', 'region_type', {
    name: 'geographies_region_type_idx',
  });
  pgm.createIndex('geographies', 'parent_geography_id', {
    name: 'geographies_parent_geography_id_idx',
  });
  pgm.createIndex('geographies', ['iso_code', 'region_type'], {
    name: 'geographies_iso_code_region_type_uidx',
    unique: true,
    where: 'iso_code IS NOT NULL',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable('geographies');
};
