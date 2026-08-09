/**
 * Phase 7 Step 10: In-app notifications table.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE notifications (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type varchar(50) NOT NULL,
      title varchar(255) NOT NULL,
      message text,
      read boolean NOT NULL DEFAULT false,
      metadata jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  pgm.sql(`CREATE INDEX idx_notifications_user_id ON notifications (user_id)`);
  pgm.sql(
    `CREATE INDEX idx_notifications_user_unread ON notifications (user_id) WHERE read = false`
  );
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_notifications_user_unread`);
  pgm.sql(`DROP INDEX IF EXISTS idx_notifications_user_id`);
  pgm.sql(`DROP TABLE IF EXISTS notifications`);
};
