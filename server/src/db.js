const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Insert rows in statements containing no more than 20 rows. D1 request limits can
 * therefore be respected by later bulk deck/replay work without duplicating logic.
 */
export async function chunkedInsert(db, { table, columns, rows }, chunkSize = 20) {
  if (!IDENTIFIER.test(table) || !columns?.length || columns.some(column => !IDENTIFIER.test(column))) {
    throw new TypeError('invalid insert target');
  }
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 20) {
    throw new RangeError('chunk size must be between 1 and 20');
  }
  const results = [];
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const batch = rows.slice(offset, offset + chunkSize);
    const tuple = `(${columns.map(() => '?').join(', ')})`;
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${batch.map(() => tuple).join(', ')}`;
    const values = batch.flatMap(row => columns.map(column => row[column] ?? null));
    results.push(await db.prepare(sql).bind(...values).run());
  }
  return results;
}

export async function atomicBatch(db, statements) {
  if (!db?.batch) throw new Error('database binding unavailable');
  return db.batch(statements);
}
