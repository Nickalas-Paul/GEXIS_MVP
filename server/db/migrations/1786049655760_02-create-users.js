/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    email: { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)' },
    display_name: { type: 'varchar(100)' },
    avatar_url: { type: 'text' },
    subscription_tier: {
      type: 'varchar(20)',
      notNull: true,
      default: 'free',
      check: "subscription_tier IN ('free', 'pro', 'marketplace')",
    },
    google_id: { type: 'varchar(255)', unique: true },
    email_verified: { type: 'boolean', notNull: true, default: false },
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

  pgm.createIndex('users', 'email', { name: 'users_email_idx' });
  pgm.createIndex('users', 'google_id', {
    name: 'users_google_id_idx',
    where: 'google_id IS NOT NULL',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable('users');
};
