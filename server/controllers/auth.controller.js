import * as authService from '../services/auth.service.js';
import { sendError } from '../utils/errors.js';

export async function register(req, res) {
  try {
    const { identifier, email, password, fullName, phoneNumber, prenom, nom } = req.body;
    const resolvedName =
      fullName?.trim() ||
      [prenom, nom].filter(Boolean).join(' ').trim();

    const result = await authService.registerUser({
      identifier: identifier || email,
      email,
      password,
      fullName: resolvedName,
      phoneNumber,
      guestSessionId: req.guestSessionId,
    });

    res.status(201).json(result);
  } catch (err) {
    sendError(res, err);
  }
}

export async function login(req, res) {
  try {
    const { identifier, email, password } = req.body;
    const result = await authService.loginUser({
      identifier: identifier || email,
      password,
      guestSessionId: req.guestSessionId,
    });
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
}

export async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    const result = await authService.requestPasswordReset(email);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
}

export async function resetPassword(req, res) {
  try {
    const { token, newPassword, password } = req.body;
    const result = await authService.resetPassword({
      token,
      newPassword: newPassword || password,
    });
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
}

export async function me(req, res) {
  try {
    const result = await authService.getProfile(req.user.id);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
}

export async function updateProfile(req, res) {
  try {
    const { fullName, phoneNumber, email } = req.body;
    const result = await authService.updateProfile(req.user.id, { fullName, phoneNumber, email });
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
}

export async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await authService.changePassword(req.user.id, {
      currentPassword,
      newPassword,
    });
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
}

