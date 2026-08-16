import * as contactService from '../services/contact.service.js';
import { sendError } from '../utils/errors.js';

export async function submit(req, res) {
  if (req.user?.role === 'admin') {
    return res.status(403).json({ error: "Les administrateurs ne peuvent pas envoyer de messages de contact." });
  }

  try {
    const { prenom, nom, firstName, lastName, email, message } = req.body;

    const result = await contactService.submitContactMessage({
      userId: req.user?.id || null,
      firstName: (firstName || prenom || ''),
      lastName: (lastName || nom || ''),
      email: (email || ''),
      message: (message || ''),
    });

    res.status(201).json(result);
  } catch (err) {
    sendError(res, err);
  }
}

export async function listAll(_req, res) {
  try {
    const messages = await contactService.getAllContactMessages();
    res.json(messages);
  } catch (err) {
    sendError(res, err);
  }
}

export async function getById(req, res) {
  try {
    const message = await contactService.getContactMessageById(req.params.id);
    res.json(message);
  } catch (err) {
    sendError(res, err);
  }
}

export async function reply(req, res) {
  try {
    const { subject, message } = req.body;
    const result = await contactService.replyToContactMessage(req.params.id, {
      subject,
      message,
    });
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
}

