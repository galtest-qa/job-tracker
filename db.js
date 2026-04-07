import initSqlJs from 'sql.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, 'jobs.db')

let db

export async function getDb() {
  if (db) return db

  const SQL = await initSqlJs()

  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      link TEXT DEFAULT '',
      description TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      source TEXT DEFAULT 'LinkedIn',
      status TEXT DEFAULT 'Saved' CHECK(status IN ('Saved','Applied','Interviewing','Rejected','Offer')),
      tags TEXT DEFAULT '[]',
      match_score INTEGER DEFAULT NULL,
      notes TEXT DEFAULT '',
      interview_notes TEXT DEFAULT '',
      company_overview TEXT DEFAULT '',
      company_industry TEXT DEFAULT '',
      company_size TEXT DEFAULT '',
      requirements_met TEXT DEFAULT '[]',
      requirements_partial TEXT DEFAULT '[]',
      requirements_unmet TEXT DEFAULT '[]',
      positioning_tips TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // Migration: add sort_order if missing
  try {
    db.run('SELECT sort_order FROM jobs LIMIT 1')
  } catch {
    db.run('ALTER TABLE jobs ADD COLUMN sort_order INTEGER DEFAULT 0')
    const stmt = db.prepare('SELECT id FROM jobs ORDER BY created_at ASC')
    let i = 0
    while (stmt.step()) {
      const row = stmt.getAsObject()
      db.run('UPDATE jobs SET sort_order = ? WHERE id = ?', [i++, row.id])
    }
    stmt.free()
  }

  // Migration: add tailored_resume and interview_prep_ai columns
  try {
    db.run('SELECT tailored_resume FROM jobs LIMIT 1')
  } catch {
    db.run('ALTER TABLE jobs ADD COLUMN tailored_resume TEXT DEFAULT \'\'')
    db.run('ALTER TABLE jobs ADD COLUMN resume_improvements TEXT DEFAULT \'[]\'')
    db.run('ALTER TABLE jobs ADD COLUMN interview_prep_ai TEXT DEFAULT \'\'')
  }

  // Migration: add contact fields
  try {
    db.run('SELECT contact_name FROM jobs LIMIT 1')
  } catch {
    db.run("ALTER TABLE jobs ADD COLUMN contact_name TEXT DEFAULT ''")
    db.run("ALTER TABLE jobs ADD COLUMN contact_role TEXT DEFAULT ''")
    db.run("ALTER TABLE jobs ADD COLUMN contact_linkedin TEXT DEFAULT ''")
    db.run("ALTER TABLE jobs ADD COLUMN contact_email TEXT DEFAULT ''")
  }

  // Migration: add logo_url field
  try {
    db.run('SELECT logo_url FROM jobs LIMIT 1')
  } catch {
    db.run("ALTER TABLE jobs ADD COLUMN logo_url TEXT DEFAULT ''")
  }

  // Kanban columns table
  db.run(`
    CREATE TABLE IF NOT EXISTS columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 0
    )
  `)

  // Migration: add is_default if missing
  try {
    db.run('SELECT is_default FROM columns LIMIT 1')
  } catch {
    db.run("ALTER TABLE columns ADD COLUMN is_default INTEGER DEFAULT 0")
  }

  // Seed default columns if empty
  const colCount = db.exec('SELECT COUNT(*) FROM columns')
  if (colCount[0]?.values[0]?.[0] === 0) {
    db.run("INSERT INTO columns (name, sort_order, is_default) VALUES ('Backlog', 0, 1)")
    const others = ['Need to Send', 'Applied', 'Interview', 'Offer', 'Rejected']
    others.forEach((name, i) => {
      db.run('INSERT INTO columns (name, sort_order, is_default) VALUES (?, ?, 0)', [name, i + 1])
    })
  }

  // Ensure Backlog column exists for existing DBs
  const hasBacklog = db.exec("SELECT COUNT(*) FROM columns WHERE is_default = 1")
  if (hasBacklog[0]?.values[0]?.[0] === 0) {
    // Get the lowest sort_order
    const minOrder = db.exec("SELECT MIN(sort_order) FROM columns")
    const min = minOrder[0]?.values[0]?.[0] ?? 0
    // Shift all existing columns down
    db.run("UPDATE columns SET sort_order = sort_order + 1")
    db.run("INSERT INTO columns (name, sort_order, is_default) VALUES ('Backlog', 0, 1)")
    // Move "Need to Send" jobs to Backlog
    db.run("UPDATE jobs SET status = 'Backlog' WHERE status = 'Need to Send'")
  }

  // Migration: remove CHECK constraint on status + rename old statuses to match new columns
  // SQLite can't ALTER constraints, so recreate the table
  try {
    // Test if the CHECK constraint still exists by trying to insert a non-standard status
    db.run("INSERT INTO jobs (company, role, status) VALUES ('__test__', '__test__', 'Need to Send')")
    // If it worked, clean up and we're good
    db.run("DELETE FROM jobs WHERE company = '__test__'")
  } catch {
    // CHECK constraint exists — recreate table without it
    db.run(`CREATE TABLE jobs_new AS SELECT * FROM jobs`)
    db.run(`DROP TABLE jobs`)
    db.run(`
      CREATE TABLE jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company TEXT NOT NULL,
        role TEXT NOT NULL,
        link TEXT DEFAULT '',
        description TEXT DEFAULT '',
        summary TEXT DEFAULT '',
        source TEXT DEFAULT 'LinkedIn',
        status TEXT DEFAULT 'Need to Send',
        tags TEXT DEFAULT '[]',
        match_score INTEGER DEFAULT NULL,
        notes TEXT DEFAULT '',
        interview_notes TEXT DEFAULT '',
        company_overview TEXT DEFAULT '',
        company_industry TEXT DEFAULT '',
        company_size TEXT DEFAULT '',
        requirements_met TEXT DEFAULT '[]',
        requirements_partial TEXT DEFAULT '[]',
        requirements_unmet TEXT DEFAULT '[]',
        positioning_tips TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        tailored_resume TEXT DEFAULT '',
        resume_improvements TEXT DEFAULT '[]',
        interview_prep_ai TEXT DEFAULT '',
        contact_name TEXT DEFAULT '',
        contact_role TEXT DEFAULT '',
        contact_linkedin TEXT DEFAULT '',
        contact_email TEXT DEFAULT '',
        logo_url TEXT DEFAULT ''
      )
    `)
    db.run(`INSERT INTO jobs SELECT * FROM jobs_new`)
    db.run(`DROP TABLE jobs_new`)

    // Rename old statuses to match new column names
    db.run("UPDATE jobs SET status = 'Need to Send' WHERE status = 'Saved'")
    db.run("UPDATE jobs SET status = 'Interview' WHERE status = 'Interviewing'")
  }

  // Reminders table
  db.run(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      type TEXT DEFAULT 'custom',
      title TEXT NOT NULL,
      due_at TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      note TEXT DEFAULT '',
      snoozed_until TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    )
  `)

  // Resume table
  db.run(`
    CREATE TABLE IF NOT EXISTS resume (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      raw_text TEXT DEFAULT '',
      parsed TEXT DEFAULT '{}',
      filename TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
  // Ensure row exists
  const resumeRow = db.exec('SELECT COUNT(*) FROM resume')
  if (resumeRow[0]?.values[0]?.[0] === 0) {
    db.run("INSERT INTO resume (id, raw_text, parsed, filename) VALUES (1, '', '{}', '')")
  }

  save()
  return db
}

export function save() {
  if (!db) return
  const data = db.export()
  writeFileSync(DB_PATH, Buffer.from(data))
}

// Helper to run queries and get results as array of objects
export function all(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const results = []
  while (stmt.step()) {
    results.push(stmt.getAsObject())
  }
  stmt.free()
  return results
}

export function get(sql, params = []) {
  const results = all(sql, params)
  return results[0] || null
}

export function run(sql, params = []) {
  db.run(sql, params)
  const rowid = db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0]
  save()
  return { lastInsertRowid: rowid }
}
