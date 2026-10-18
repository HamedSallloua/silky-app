import * as draftService from '../services/draft.service.js';
import { sendError } from '../utils/errors.js';

export async function list(_req, res) {
  try {
    const drafts = await draftService.getAllDrafts();
    res.json(drafts);
  } catch (err) {
    sendError(res, err);
  }
}

export async function getById(req, res) {
  try {
    const draft = await draftService.getDraftById(req.params.id);
    res.json(draft);
  } catch (err) {
    sendError(res, err);
  }
}

export async function create(req, res) {
  try {
    const draft = await draftService.createDraft(req.body);
    res.status(201).json(draft);
  } catch (err) {
    sendError(res, err);
  }
}

export async function save(req, res) {
  try {
    const draft = await draftService.saveDraft(req.params.id, req.body);
    res.json(draft);
  } catch (err) {
    sendError(res, err);
  }
}

export async function remove(req, res) {
  try {
    const result = await draftService.deleteDraft(req.params.id);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
}

export async function confirm(req, res) {
  try {
    const order = await draftService.confirmDraftAsOrder(req.params.id);
    res.status(201).json(order);
  } catch (err) {
    if (err.status === 422 && err.missingFields) {
      return res.status(422).json({
        error: err.message,
        missingFields: err.missingFields,
      });
    }
    sendError(res, err);
  }
}
