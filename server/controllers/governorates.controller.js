import { governorateRepository } from '../repositories/governorate.repository.js';
import { sendError } from '../utils/errors.js';

export async function list(_req, res) {
  try {
    const list = await governorateRepository.findAll();
    res.json(list);
  } catch (err) {
    sendError(res, err);
  }
}
