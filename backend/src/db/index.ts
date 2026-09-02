import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'travel-blog.db');

let db: SqlJsDatabase | null = null;

export async function initializeDatabase(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Run schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  // Split out ALTER TABLE ADD COLUMN and CREATE INDEX statements to run separately.
  // ALTER TABLE ADD COLUMN fails if column exists, and CREATE INDEX may reference new columns
  // that only exist after ALTER runs, so: main schema -> ALTERs -> indexes.
  const alterStatements: string[] = [];
  const indexStatements: string[] = [];
  const mainSchema = schema.split('\n').filter(line => {
    const trimmed = line.trim().toUpperCase();
    if (trimmed.startsWith('ALTER TABLE') && trimmed.includes('ADD COLUMN')) {
      alterStatements.push(line.trim());
      return false;
    }
    if (trimmed.startsWith('CREATE INDEX')) {
      indexStatements.push(line.trim());
      return false;
    }
    return true;
  }).join('\n');

  db.run(mainSchema);

  // Run ALTER TABLE ADD COLUMN statements individually, ignoring "duplicate column" errors
  for (const stmt of alterStatements) {
    try {
      db.run(stmt);
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) {
        throw e;
      }
    }
  }

  // Now run CREATE INDEX statements (they may reference columns added by ALTER above)
  for (const stmt of indexStatements) {
    try {
      db.run(stmt);
    } catch {
      // Ignore "index already exists" errors
    }
  }

  // Save to disk
  saveDatabase();

  console.log('Database initialized successfully');
  return db;
}

export function getDatabase(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export function saveDatabase(): void {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

// Helper to run a query and get results as objects
export function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  const database = getDatabase();
  const stmt = database.prepare(sql);
  stmt.bind(params as any);

  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

// Helper to run a statement (INSERT, UPDATE, DELETE)
export function run(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number } {
  const database = getDatabase();
  database.run(sql, params as any);
  const info = database.exec('SELECT changes() as changes, last_insert_rowid() as lastId');
  const result = info[0]?.values[0] || [0, 0];
  saveDatabase(); // Persist changes
  return {
    changes: result[0] as number,
    lastInsertRowid: result[1] as number,
  };
}

// Helper to get a single row
export function get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  const results = query<T>(sql, params);
  return results[0];
}

export default { initializeDatabase, getDatabase, saveDatabase, query, run, get };
