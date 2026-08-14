import * as galleryService from '../services/gallery.service.js';
import { sendError } from '../utils/errors.js';

export async function list(_req, res) {
  try {
    const gallery = await galleryService.getGallery();
    res.json(gallery);
  } catch (err) {
    sendError(res, err);
  }
}

export async function add(req, res) {
  let src = req.body.src?.trim();

  if (req.file) {
    src = `/uploads/${req.file.filename}`;
  }

  if (!src) {
    return res.status(400).json({ error: 'Image URL or file required' });
  }

  try {
    const item = await galleryService.addGalleryItem({
      src,
      alt: req.body.alt?.trim() || 'Avis client',
    });
    res.status(201).json(item);
  } catch (err) {
    sendError(res, err);
  }
}

export async function remove(req, res) {
  try {
    await galleryService.deleteGalleryItem(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
}

