#!/usr/bin/env node
/**
 * One-time migration: submittedDB.trouble_time back to decimal HOURS.
 *
 * Background
 * ----------
 * `trouble_time` has always been a decimal-hours field (same unit as
 * `break_time` and `man_hours`), and every dashboard/aggregation reads it that
 * way. Commit 9a91cea ("added dynamic trouble list", 2026-09-17) accidentally
 * started writing it in MINUTES from the tablet, which made trouble downtime
 * read 60x too large in the analytics Gantt, the KPI tiles and the MoM report.
 *
 * The same commit introduced `trouble_details` (a per-reason breakdown, always
 * in minutes). No record written before that commit has the field, so
 * `trouble_details` is an exact marker for the minutes-era records — this
 * script converts those and leaves everything else untouched.
 *
 * Usage
 * -----
 *   MONGODB_URI=... node scripts/migrate-trouble-time-to-hours.js            # dry run (default)
 *   MONGODB_URI=... node scripts/migrate-trouble-time-to-hours.js --apply    # write changes
 *
 * Options
 * -------
 *   --apply            Actually write. Without it nothing is modified.
 *   --db=<name>        Limit to one company database (default: all of them).
 *   --fix-man-hours    Also recompute man_hours for converted records whose
 *                      stored value disagrees with start/end/break/trouble.
 *                      Off by default so manual man_hours edits are preserved;
 *                      the dry run always REPORTS the mismatches either way.
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MASTER_DB_NAME = 'Sasaki_Coating_MasterDB';
const MASTER_COLLECTION = 'masterUsers';
const TARGET_COLLECTION = 'submittedDB';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FIX_MAN_HOURS = args.includes('--fix-man-hours');
const ONLY_DB = (args.find(a => a.startsWith('--db=')) || '').slice('--db='.length) || null;

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function parseClockToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return hours * 60 + minutes + seconds / 60;
}

// Mirrors calculateSubmittedDBManHours() in ksgServer.js.
function calculateManHours(startTime, endTime, breakHours, troubleHours) {
  const startMinutes = parseClockToMinutes(startTime);
  const endMinutes = parseClockToMinutes(endTime);
  if (startMinutes === null || endMinutes === null) return null;

  let elapsed = endMinutes - startMinutes;
  if (elapsed < 0) elapsed += 24 * 60;

  const safeBreak = Math.max(0, Number(breakHours ?? 0) || 0);
  const safeTrouble = Math.max(0, Number(troubleHours ?? 0) || 0);
  return round2(Math.max(0, elapsed / 60 - safeBreak - safeTrouble));
}

async function resolveTargetDatabases(client) {
  if (ONLY_DB) return [ONLY_DB];

  const masterUsers = await client
    .db(MASTER_DB_NAME)
    .collection(MASTER_COLLECTION)
    .find({ role: 'masterUser' })
    .project({ company: 1, dbName: 1 })
    .toArray();

  const databases = new Set(['KSG']);
  masterUsers.forEach(user => {
    const dbName = user.dbName || user.company;
    if (dbName) databases.add(dbName);
  });

  return Array.from(databases);
}

async function migrateDatabase(client, dbName) {
  const collection = client.db(dbName).collection(TARGET_COLLECTION);

  // trouble_details only exists on records written after the minutes regression.
  const candidates = await collection
    .find({ trouble_details: { $exists: true }, trouble_time: { $gt: 0 } })
    .project({
      trouble_time: 1,
      trouble_details: 1,
      man_hours: 1,
      break_time: 1,
      start_time: 1,
      end_time: 1,
      timestamp: 1,
      submitted_from: 1,
      hinban: 1
    })
    .toArray();

  const stats = { scanned: candidates.length, converted: 0, manHoursMismatched: 0, manHoursFixed: 0 };
  if (candidates.length === 0) {
    console.log(`  ${dbName}: nothing to convert.`);
    return stats;
  }

  for (const record of candidates) {
    const minutes = Number(record.trouble_time) || 0;
    const hours = round2(minutes / 60);

    const detailMinutes = record.trouble_details && typeof record.trouble_details === 'object'
      ? Object.values(record.trouble_details).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
      : null;
    const detailNote = detailMinutes !== null && Math.abs(detailMinutes - minutes) > 0.01
      ? `  ⚠ trouble_details sums to ${detailMinutes}m, not ${minutes}m`
      : '';

    const updates = { trouble_time: hours };

    const expectedManHours = calculateManHours(record.start_time, record.end_time, record.break_time, hours);
    const storedManHours = round2(record.man_hours);
    const manHoursMismatch = expectedManHours !== null && Math.abs(expectedManHours - storedManHours) > 0.01;
    if (manHoursMismatch) {
      stats.manHoursMismatched += 1;
      if (FIX_MAN_HOURS) {
        updates.man_hours = expectedManHours;
        stats.manHoursFixed += 1;
      }
    }

    const when = record.timestamp instanceof Date ? record.timestamp.toISOString() : String(record.timestamp ?? '—');
    console.log(
      `  ${APPLY ? 'UPDATE' : 'WOULD UPDATE'} ${record._id} (${when}, ${record.submitted_from || '—'}, ${record.hinban || '—'}): ` +
      `trouble_time ${minutes} → ${hours} h` +
      (manHoursMismatch ? `; man_hours ${storedManHours} ${FIX_MAN_HOURS ? `→ ${expectedManHours}` : `(expected ${expectedManHours}, left as-is)`}` : '') +
      detailNote
    );

    if (APPLY) {
      await collection.updateOne({ _id: record._id }, { $set: updates });
    }
    stats.converted += 1;
  }

  return stats;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set.');
    process.exit(1);
  }

  console.log(APPLY ? '🚀 APPLY mode — records will be modified.' : '🔍 DRY RUN — no records will be modified. Re-run with --apply to write.');
  if (!FIX_MAN_HOURS) {
    console.log('ℹ️  man_hours will be reported but not changed. Pass --fix-man-hours to recompute it too.');
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();

  const totals = { scanned: 0, converted: 0, manHoursMismatched: 0, manHoursFixed: 0 };

  try {
    const databases = await resolveTargetDatabases(client);
    for (const dbName of databases) {
      console.log(`\n📦 ${dbName}.${TARGET_COLLECTION}`);
      const stats = await migrateDatabase(client, dbName);
      totals.scanned += stats.scanned;
      totals.converted += stats.converted;
      totals.manHoursMismatched += stats.manHoursMismatched;
      totals.manHoursFixed += stats.manHoursFixed;
    }
  } finally {
    await client.close();
  }

  console.log(
    `\n✅ ${APPLY ? 'Converted' : 'Would convert'} ${totals.converted} of ${totals.scanned} candidate record(s). ` +
    `man_hours mismatches: ${totals.manHoursMismatched}${FIX_MAN_HOURS ? ` (fixed ${totals.manHoursFixed})` : ''}.`
  );
}

main().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
