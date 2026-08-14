import { db } from '../db/orm.js';

/**
 * Executes a callback within a Drizzle database transaction.
 * Decouples service modules from direct ORM instance imports while
 * preserving multi-repository transaction scoping and rollback behavior.
 */
export async function runInTransaction(fn) {
  return db.transaction(fn);
}
