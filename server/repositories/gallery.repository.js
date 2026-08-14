import { eq, desc } from 'drizzle-orm';
import { db } from '../db/orm.js';
import { reviewGallery } from '../models/index.js';

export const galleryRepository = {
  async findAll(tx = db) {
    const rows = await tx.select().from(reviewGallery).orderBy(desc(reviewGallery.createdAt));
    return rows.map((r) => ({
      id: r.id,
      src: r.imageUrl,
      alt: r.altText,
      createdAt: r.createdAt,
    }));
  },

  async create({ src, alt = 'Avis client' }, tx = db) {
    const [inserted] = await tx.insert(reviewGallery).values({
      imageUrl: src,
      altText: alt,
    }).returning();

    return {
      id: inserted.id,
      src: inserted.imageUrl,
      alt: inserted.altText,
      createdAt: inserted.createdAt,
    };
  },

  async delete(id, tx = db) {
    const [deleted] = await tx.delete(reviewGallery).where(eq(reviewGallery.id, id)).returning();
    return deleted || null;
  }
};
