/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createTable('agent_reviews', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    agent_id: {
      type: 'uuid',
      notNull: true,
      references: 'agents',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    rating: {
      type: 'numeric(3,2)',
      notNull: true,
      check: 'rating >= 1 AND rating <= 5',
    },
    review_text: { type: 'text' },
    engagement_type: { type: 'varchar(50)' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('agent_reviews', 'agent_id', {
    name: 'agent_reviews_agent_id_idx',
  });
  pgm.createIndex('agent_reviews', ['agent_id', 'user_id'], {
    name: 'agent_reviews_agent_id_user_id_uidx',
    unique: true,
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable('agent_reviews');
};
