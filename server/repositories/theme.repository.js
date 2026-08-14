import { eq } from 'drizzle-orm';
import { db } from '../db/orm.js';
import { siteSettings } from '../models/index.js';

const DEFAULT_THEME = {
  primary: '#8D191C',
  secondary: '#F3EBEC',
  heroLeftImage: '/pictures/femme_example.jpg',
  heroRightImage: '/pictures/enfant_example.jpg',
};

export const themeRepository = {
  async getSettings(tx = db) {
    const [row] = await tx.select().from(siteSettings).where(eq(siteSettings.id, 1));
    if (!row) {
      const [inserted] = await tx.insert(siteSettings).values({ id: 1 }).returning();
      return {
        primary: inserted.primaryColor || DEFAULT_THEME.primary,
        secondary: inserted.secondaryColor || DEFAULT_THEME.secondary,
        heroLeftImage: inserted.heroLeftImage || DEFAULT_THEME.heroLeftImage,
        heroRightImage: inserted.heroRightImage || DEFAULT_THEME.heroRightImage,
      };
    }
    return {
      primary: row.primaryColor || DEFAULT_THEME.primary,
      secondary: row.secondaryColor || DEFAULT_THEME.secondary,
      heroLeftImage: row.heroLeftImage || DEFAULT_THEME.heroLeftImage,
      heroRightImage: row.heroRightImage || DEFAULT_THEME.heroRightImage,
    };
  },

  async updateSettings({ primary, secondary, heroLeftImage, heroRightImage }, tx = db) {
    const current = await this.getSettings(tx);

    const [updated] = await tx.insert(siteSettings).values({
      id: 1,
      primaryColor: primary || current.primary,
      secondaryColor: secondary || current.secondary,
      heroLeftImage: heroLeftImage || current.heroLeftImage,
      heroRightImage: heroRightImage || current.heroRightImage,
    })
    .onConflictDoUpdate({
      target: [siteSettings.id],
      set: {
        primaryColor: primary || current.primary,
        secondaryColor: secondary || current.secondary,
        heroLeftImage: heroLeftImage || current.heroLeftImage,
        heroRightImage: heroRightImage || current.heroRightImage,
        updatedAt: new Date(),
      },
    })
    .returning();

    return {
      primary: updated.primaryColor || DEFAULT_THEME.primary,
      secondary: updated.secondaryColor || DEFAULT_THEME.secondary,
      heroLeftImage: updated.heroLeftImage || DEFAULT_THEME.heroLeftImage,
      heroRightImage: updated.heroRightImage || DEFAULT_THEME.heroRightImage,
    };
  },

  async getDeliveryFee(tx = db) {
    const [row] = await tx.select({ deliveryFee: siteSettings.deliveryFee }).from(siteSettings).where(eq(siteSettings.id, 1));
    return row ? parseFloat(row.deliveryFee) : 8;
  }
};
