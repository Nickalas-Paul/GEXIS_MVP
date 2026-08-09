/**
 * Phase 7 Step 1: Expand agent taxonomy + create agent_engagements.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  // --- Part A: Expand agents table ---

  pgm.sql(`ALTER TABLE agents DROP CONSTRAINT agents_category_check`);

  pgm.sql(`
    ALTER TABLE agents ADD CONSTRAINT agents_category_check
    CHECK (category IN (
      'commercial_real_estate',
      'permitting_compliance',
      'legal_counsel',
      'supply_chain_3pl',
      'workforce_recruiting',
      'other'
    ))
  `);

  pgm.sql(`ALTER TABLE agents ADD COLUMN custom_category varchar(100)`);

  pgm.sql(`ALTER TABLE agents ADD COLUMN domain_tags text[] NOT NULL DEFAULT '{}'`);
  pgm.sql(`CREATE INDEX idx_agents_domain_tags ON agents USING GIN (domain_tags)`);

  pgm.sql(
    `ALTER TABLE agents ADD COLUMN industry_verticals text[] NOT NULL DEFAULT '{}'`
  );
  pgm.sql(
    `CREATE INDEX idx_agents_industry_verticals ON agents USING GIN (industry_verticals)`
  );

  pgm.sql(`ALTER TABLE agents ADD COLUMN search_vector tsvector`);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION agents_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.company, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.custom_category, '')), 'B') ||
        setweight(to_tsvector('english', array_to_string(NEW.domain_tags, ' ')), 'B') ||
        setweight(to_tsvector('english', coalesce(NEW.bio, '')), 'C');
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `);

  pgm.sql(`
    CREATE TRIGGER trg_agents_search_vector
    BEFORE INSERT OR UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION agents_search_vector_update()
  `);

  pgm.sql(
    `CREATE INDEX idx_agents_search_vector ON agents USING GIN (search_vector)`
  );

  pgm.sql(`
    CREATE UNIQUE INDEX agents_user_id_unique
    ON agents (user_id)
    WHERE user_id IS NOT NULL
  `);

  // --- Part B: Create agent_engagements ---

  pgm.sql(`
    CREATE TABLE agent_engagements (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status varchar(20) NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'accepted', 'declined', 'active', 'completed')),
      business_description text,
      expansion_goals text,
      timeline varchar(50),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  pgm.sql(
    `CREATE INDEX idx_agent_engagements_agent_id ON agent_engagements (agent_id)`
  );
  pgm.sql(
    `CREATE INDEX idx_agent_engagements_user_id ON agent_engagements (user_id)`
  );
  pgm.sql(
    `CREATE INDEX idx_agent_engagements_status ON agent_engagements (status)`
  );
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_agent_engagements_status`);
  pgm.sql(`DROP INDEX IF EXISTS idx_agent_engagements_user_id`);
  pgm.sql(`DROP INDEX IF EXISTS idx_agent_engagements_agent_id`);
  pgm.sql(`DROP TABLE IF EXISTS agent_engagements`);

  pgm.sql(`DROP INDEX IF EXISTS agents_user_id_unique`);
  pgm.sql(`DROP INDEX IF EXISTS idx_agents_search_vector`);
  pgm.sql(`DROP TRIGGER IF EXISTS trg_agents_search_vector ON agents`);
  pgm.sql(`DROP FUNCTION IF EXISTS agents_search_vector_update()`);
  pgm.sql(`DROP INDEX IF EXISTS idx_agents_industry_verticals`);
  pgm.sql(`ALTER TABLE agents DROP COLUMN IF EXISTS industry_verticals`);
  pgm.sql(`DROP INDEX IF EXISTS idx_agents_domain_tags`);
  pgm.sql(`ALTER TABLE agents DROP COLUMN IF EXISTS domain_tags`);
  pgm.sql(`ALTER TABLE agents DROP COLUMN IF EXISTS search_vector`);
  pgm.sql(`ALTER TABLE agents DROP COLUMN IF EXISTS custom_category`);

  pgm.sql(`ALTER TABLE agents DROP CONSTRAINT agents_category_check`);
  pgm.sql(`
    ALTER TABLE agents ADD CONSTRAINT agents_category_check
    CHECK (category IN (
      'commercial_real_estate',
      'permitting_compliance',
      'legal_counsel',
      'supply_chain_3pl',
      'workforce_recruiting'
    ))
  `);
};
