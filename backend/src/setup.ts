import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import readline from 'readline';

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'travel-blog.db');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main(): Promise<void> {
  console.log('=================================');
  console.log('  Travel Blog Setup Script');
  console.log('=================================');

  // Initialize sql.js
  const SQL = await initSqlJs();

  // Load existing database or create new one
  let db;
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
    console.log('Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('Created new database');
  }

  // Run schema
  const schemaPath = path.join(__dirname, './db/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.run(schema);

  // Create two author accounts
  for (let i = 1; i <= 2; i++) {
    console.log(`\n--- Setting up Author ${i} ---`);

    const username = await question('Username: ');
    const displayName = await question('Display name: ');
    const password = await question('Password: ');

    const passwordHash = bcrypt.hashSync(password, 10);

    try {
      db.run(
        'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)',
        [username, passwordHash, displayName]
      );
      console.log(`Created author: ${displayName} (@${username})`);
    } catch (err) {
      if ((err as Error).message.includes('UNIQUE')) {
        console.log(`Username "${username}" already exists, skipping...`);
      } else {
        throw err;
      }
    }
  }

  // Set viewer password
  console.log('\n--- Setting Viewer Password ---');
  const viewerPassword = await question('Viewer password (for friends/family access): ');
  const viewerPasswordHash = bcrypt.hashSync(viewerPassword, 10);
  db.run(
    'INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)',
    ['viewer_password_hash', viewerPasswordHash]
  );
  console.log('Viewer password set successfully!');

  // Set site title
  console.log('\n--- Setting Site Title ---');
  const title = (await question('Site title (default: "Our Travel Blog"): ')) || 'Our Travel Blog';
  db.run(
    'INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)',
    ['site_title', title]
  );
  console.log(`Site title set to: ${title}`);

  // Save database
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);

  console.log('\n=================================');
  console.log('  Setup Complete!');
  console.log('=================================');
  console.log('\nYou can now start the servers:');
  console.log('  cd backend && npm run dev');
  console.log('  cd frontend && npm run dev');

  rl.close();
  db.close();
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
