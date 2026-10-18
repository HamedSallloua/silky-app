import * as notificationService from '../services/notification.service.js';
import { sendError } from '../utils/errors.js';

export async function list(_req, res) {
  try {
    const data = await notificationService.getNotifications({ limit: 5 });
    res.json(data);
  } catch (err) {
    sendError(res, err);
  }
}

export async function listAll(req, res) {
  try {
    const { offset, limit } = req.query;
    const data = await notificationService.getAllNotifications({ offset, limit });
    res.json(data);
  } catch (err) {
    sendError(res, err);
  }
}

export async function markRead(req, res) {
  try {
    const notification = await notificationService.markRead(req.params.id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification non trouvée' });
    }
    res.json({ success: true, notification });
  } catch (err) {
    sendError(res, err);
  }
}

export async function markAllRead(_req, res) {
  try {
    await notificationService.markAllRead();
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
}
