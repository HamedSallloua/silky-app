import { themeRepository } from '../repositories/theme.repository.js';

export async function getTheme() {
  return themeRepository.getSettings();
}

export async function updateTheme({ primary, secondary, heroLeftImage, heroRightImage }) {
  return themeRepository.updateSettings({
    primary,
    secondary,
    heroLeftImage,
    heroRightImage,
  });
}

export async function getDeliveryFee() {
  return themeRepository.getDeliveryFee();
}
