import { themeRepository } from '../repositories/theme.repository.js';

export async function getTheme() {
  return themeRepository.getSettings();
}

export async function updateTheme({ primary, secondary, heroLeftImage, heroRightImage, announcements, announcementsHidden, heroConfig }) {
  return themeRepository.updateSettings({
    primary,
    secondary,
    heroLeftImage,
    heroRightImage,
    announcements,
    announcementsHidden,
    heroConfig,
  });
}

export async function getDeliveryFee() {
  return themeRepository.getDeliveryFee();
}
