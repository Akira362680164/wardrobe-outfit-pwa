import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql:///wardrobe_test';

describe('integration:overview-structure-only', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    const result = await pool.query('SELECT 1 AS ok');
    expect(result.rows[0].ok).toBe(1);
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('should connect to test database', async () => {
    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema='public' AND table_type='BASE TABLE'
      ORDER BY table_name
    `);
    expect(result.rows.length).toBeGreaterThan(0);
    const tables = result.rows.map((r: any) => r.table_name);
    expect(tables).toContain('users');
    expect(tables).toContain('garments');
    expect(tables).toContain('outfits');
    expect(tables).toContain('assets');
    expect(tables).toContain('asset_bindings');
  });

  it('should create and insert a test user', async () => {
    const result = await pool.query(
      `INSERT INTO users (id, display_name) VALUES (gen_random_uuid(), $1) RETURNING id, display_name`,
      ['test_user_roundtrip']
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].display_name).toBe('test_user_roundtrip');
  });

  it('should create default location with dexieId home constraint', async () => {
    const userResult = await pool.query(
      `INSERT INTO users (id, display_name) VALUES (gen_random_uuid(), $1) RETURNING id`,
      ['test_user_location2']
    );
    const userId = userResult.rows[0].id;
    
    const locResult = await pool.query(
      `INSERT INTO locations (user_id, origin_device_id, payload) VALUES ($1, $2, $3) RETURNING id`,
      [userId, 'test-device', JSON.stringify({ dexieId: 'home', name: '默认衣橱' })]
    );
    expect(locResult.rows.length).toBe(1);
  });
});
