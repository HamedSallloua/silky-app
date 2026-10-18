import { eq, sql } from 'drizzle-orm';
import { db } from '../db/orm.js';
import { governorates } from '../models/orders.model.js';
import { resolveGovernorateSync } from '../config/governorates.js';

export const governorateRepository = {
  resolveSync(identifier) {
    return resolveGovernorateSync(identifier);
  },
  async findAll(tx = db) {
    return tx.select().from(governorates).orderBy(governorates.name);
  },

  async findById(id, tx = db) {
    if (!id) return null;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) return null;
    const [row] = await tx.select().from(governorates).where(eq(governorates.id, numId));
    return row || null;
  },

  async findByName(name, tx = db) {
    if (!name || typeof name !== 'string') return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    const [row] = await tx
      .select()
      .from(governorates)
      .where(sql`LOWER(${governorates.name}) = LOWER(${trimmed})`);
    return row || null;
  },

  async findByCode(code, tx = db) {
    if (!code || typeof code !== 'string') return null;
    const trimmed = code.trim();
    if (!trimmed) return null;
    const [row] = await tx
      .select()
      .from(governorates)
      .where(sql`LOWER(${governorates.code}) = LOWER(${trimmed})`);
    return row || null;
  },

  /**
   * Resolves an identifier which may be an integer ID, string ID, canonical name, or code.
   * Returns canonical { id, name, code } or null if invalid/unrecognized.
   */
  async resolve(identifier, tx = db) {
    if (identifier === null || identifier === undefined) return null;

    if (typeof identifier === 'number') {
      if (Number.isInteger(identifier) && identifier > 0) {
        return this.findById(identifier, tx);
      }
      return null;
    }

    if (typeof identifier === 'string') {
      const trimmed = identifier.trim();
      if (!trimmed) return null;

      // Check if it is a numeric ID in string format (e.g. "1")
      if (/^\d+$/.test(trimmed)) {
        const byId = await this.findById(parseInt(trimmed, 10), tx);
        if (byId) return byId;
      }

      // Check by code
      const byCode = await this.findByCode(trimmed, tx);
      if (byCode) return byCode;

      // Check by name
      const byName = await this.findByName(trimmed, tx);
      if (byName) return byName;
    }

    return null;
  },
};
