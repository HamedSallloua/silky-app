import { eq } from 'drizzle-orm';
import { db } from '../db/orm.js';
import { siteSettings } from '../models/index.js';

export const themeRepository = {
  async getSettings(tx = db) {
    const [row] = await tx.select().from(siteSettings).where(eq(siteSettings.id, 1));
    if (!row) {
      const [inserted] = await tx.insert(siteSettings).values({ id: 1 }).returning();
      return {
        primaryColor: inserted.primaryColor,
        secondaryColor: inserted.secondaryColor,
        heroLeftImage: inserted.heroLeftImage,
        heroRightImage: inserted.heroRightImage,
        deliveryFee: parseFloat(inserted.deliveryFee),
      };
    }
    return {
      primaryColor: row.primaryColor,
      secondaryColor: row.secondaryColor,
      heroLeftImage: row.heroLeftImage,
      heroRightImage: row.heroRightImage,
      deliveryFee: parseFloat(row.deliveryFee),
    };
  },

  async updateSettings({ primary, secondary, heroLeftImage, heroRightImage }, tx = db) {
    const current = await this.getSettings(tx);

    const [updated] = await tx.insert(siteSettings).values({
      id: 1,
      primaryColor: primary || current.primaryColor,
      secondaryColor: secondary || current.secondaryColor,
      heroLeftImage: heroLeftImage || current.heroLeftImage,
      heroRightImage: heroRightImage || current.heroRightImage,
    })
    .onConflictDoUpdate({
      target: [siteSettings.id],
      set: {
        primaryColor: primary || current.primaryColor,
        secondaryColor: secondary || current.secondaryColor,
        heroLeftImage: heroLeftImage || current.heroLeftImage,
        heroRightImage: heroRightImage || current.heroRightImage,
        updatedAt: new Date(),
      },
    })
    .returning();

    return {
      primaryColor: updated.primaryColor,
      secondaryColor: updated.secondaryColor,
      heroLeftImage: updated.heroLeftImage,
      heroRightImage: updated.heroRightImage,
      deliveryFee: parseFloat(updated.deliveryFee),
    };
  },

  async getDeliveryFee(tx = db) {
    const settings = await this.getSettings(tx);
    return settings.deliveryFee;
  }
};
