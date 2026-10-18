import * as themeService from '../services/theme.service.js';
import { sendError } from '../utils/errors.js';

export async function get(_req, res) {
  try {
    const theme = await themeService.getTheme();
    res.json(theme);
  } catch (err) {
    sendError(res, err);
  }
}

export async function update(req, res) {
  const { primary, secondary, heroLeftImage, heroRightImage, announcements, announcementsHidden, heroConfig } = req.body;
  if (!primary || !secondary) {
    return res.status(400).json({ error: 'primary and secondary colors required' });
  }

  try {
    const theme = await themeService.updateTheme({
      primary,
      secondary,
      heroLeftImage,
      heroRightImage,
      announcements,
      announcementsHidden,
      heroConfig,
    });
    res.json(theme);
  } catch (err) {
    sendError(res, err);
  }
}

export async function uploadImage(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Image file required' });
  res.json({ url: `/uploads/${req.file.filename}` });
}

