import { draftRepository } from '../repositories/draft.repository.js';
import { orderRepository } from '../repositories/order.repository.js';
import * as adminService from './admin.service.js';
import { runInTransaction } from '../repositories/transaction.repository.js';
import { AppError } from '../utils/errors.js';
import { MAX_ITEM_QUANTITY, MAX_ORDER_ITEMS } from '../config/orderLimits.js';
import { resolveGovernorateSync } from '../config/governorates.js';

/**
 * Validate draft fields against existing Manual Orders mandatory requirements.
 * Returns an array of missing/invalid field descriptions.
 */
export function validateDraftForConfirmation(draft) {
  const missingFields = [];

  const trimmedName = (draft.customerName || '').trim();
  if (!trimmedName) {
    missingFields.push('Nom du client obligatoire');
  } else if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(trimmedName)) {
    missingFields.push('Le nom du client doit contenir uniquement des lettres');
  } else if (trimmedName.length < 3) {
    missingFields.push('Le nom du client doit contenir au moins 3 lettres');
  } else if (trimmedName.length > 35) {
    missingFields.push('Le nom du client ne doit pas dépasser 35 lettres');
  }

  const trimmedPhone = (draft.phoneNumber || '').trim();
  if (!trimmedPhone) {
    missingFields.push('Numéro de téléphone obligatoire');
  } else if (!/^\d{8}$/.test(trimmedPhone)) {
    missingFields.push('Le numéro de téléphone doit contenir exactement 8 chiffres');
  }

  const trimmedEmail = (draft.customerEmail || '').trim();
  if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    missingFields.push('Adresse e-mail invalide');
  }

  const trimmedGov = (draft.governorate || '').trim();
  if (!trimmedGov) {
    missingFields.push('Gouvernorat obligatoire');
  } else if (!resolveGovernorateSync(trimmedGov)) {
    missingFields.push('Gouvernorat invalide');
  }

  const trimmedAddress = (draft.shippingAddress || '').trim();
  if (!trimmedAddress) {
    missingFields.push('Adresse de livraison obligatoire');
  }

  if (draft.deliveryFee !== null && draft.deliveryFee !== undefined && draft.deliveryFee !== '') {
    const feeStr = String(draft.deliveryFee).trim();
    if (!/^\d+(\.\d{1,3})?$/.test(feeStr) || parseFloat(feeStr) < 0) {
      missingFields.push('Frais de livraison invalides');
    }
  }

  const items = Array.isArray(draft.items) ? draft.items : [];
  const validItems = items.filter((i) => i && i.variantId);
  if (validItems.length === 0) {
    missingFields.push('Au moins un article valide est requis');
  } else if (validItems.length > MAX_ORDER_ITEMS) {
    missingFields.push(`Trop d'articles dans la commande (maximum ${MAX_ORDER_ITEMS})`);
  } else {
    for (const item of validItems) {
      const qty = parseInt(item.quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        missingFields.push('La quantité de chaque article doit être un entier positif');
        break;
      }
      if (qty > MAX_ITEM_QUANTITY) {
        missingFields.push(`La quantité maximale par article est de ${MAX_ITEM_QUANTITY}`);
        break;
      }
    }
  }

  return missingFields;
}

export async function getAllDrafts() {
  return draftRepository.findAllActiveDrafts();
}

export async function getDraftById(id) {
  if (!id) {
    throw new AppError('ID de brouillon requis', 400);
  }

  const draft = await draftRepository.findDraftById(id);
  if (!draft) {
    throw new AppError('Brouillon non trouvé', 404);
  }

  return draft;
}

export async function createDraft(data = {}) {
  const {
    customerName,
    phoneNumber,
    customerEmail,
    governorate,
    shippingAddress,
    deliveryFee,
    notes,
    items,
  } = data;

  return draftRepository.createDraft(
    {
      customerName,
      phoneNumber,
      customerEmail,
      governorate,
      shippingAddress,
      deliveryFee,
      notes,
    },
    Array.isArray(items) ? items : []
  );
}

export async function saveDraft(id, data = {}) {
  if (!id) {
    throw new AppError('ID de brouillon requis', 400);
  }

  const existing = await draftRepository.findDraftById(id);
  if (!existing) {
    throw new AppError('Brouillon non trouvé', 404);
  }

  if (existing.convertedAt || existing.convertedOrderId) {
    throw new AppError('Impossible de modifier un brouillon déjà converti en commande.', 409);
  }

  const {
    customerName,
    phoneNumber,
    customerEmail,
    governorate,
    shippingAddress,
    deliveryFee,
    notes,
    items,
  } = data;

  const updated = await draftRepository.updateDraft(
    id,
    {
      customerName,
      phoneNumber,
      customerEmail,
      governorate,
      shippingAddress,
      deliveryFee,
      notes,
    },
    items !== undefined ? items : undefined
  );

  return updated;
}

export async function deleteDraft(id) {
  if (!id) {
    throw new AppError('ID de brouillon requis', 400);
  }

  const existing = await draftRepository.findDraftById(id);
  if (!existing) {
    throw new AppError('Brouillon non trouvé', 404);
  }

  if (existing.convertedAt || existing.convertedOrderId) {
    throw new AppError('Impossible de supprimer un brouillon déjà converti en commande.', 409);
  }

  await draftRepository.deleteDraft(id);
  return { ok: true, id };
}

/**
 * Confirms a draft into a real order by passing validated data to the existing
 * authoritative Manual Orders system (adminService.createManualOrder).
 *
 * Guarantees exactly-once conversion across separate database transactions:
 * 1. Pre-validation of all mandatory Manual Order fields.
 * 2. State D recovery check: if an order was already created for this draft in a previous
 *    attempt where draft marking was interrupted, recovers the existing order immediately
 *    and NEVER calls createManualOrder() a second time.
 * 3. Draft row is locked with SELECT ... FOR UPDATE.
 * 4. Manual Order is created in its own transactional boundary.
 * 5. Persistent conversion journal and draft row are updated with convertedOrderId and convertedAt.
 * 6. Concurrent or repeated attempts resolve safely to the single existing order (State B / State E).
 */
export async function confirmDraftAsOrder(id) {
  if (!id) {
    throw new AppError('ID de brouillon requis', 400);
  }

  // 1. Initial quick check before locking
  const preliminaryDraft = await draftRepository.findDraftById(id);
  if (!preliminaryDraft) {
    throw new AppError('Brouillon non trouvé', 404);
  }

  // Check if draft is already marked as converted
  if (preliminaryDraft.convertedOrderId || preliminaryDraft.convertedAt) {
    throw new AppError('Ce brouillon a déjà été confirmé et transformé en commande.', 409);
  }

  // State D Recovery Check: If order was created in previous attempt but draft update was interrupted
  const recordedOrderId = await draftRepository.findConversionOrderIdByDraftId(id);
  if (recordedOrderId) {
    const existingOrder = await orderRepository.findById(recordedOrderId);
    if (existingOrder) {
      // Order exists! Reconnect it to draft and return without creating a duplicate order
      await draftRepository.markConverted(id, existingOrder.id);
      return existingOrder;
    }
  }

  // 2. Pre-validation of all mandatory Manual Order fields
  const missingFields = validateDraftForConfirmation(preliminaryDraft);
  if (missingFields.length > 0) {
    const error = new AppError(
      `Impossible de confirmer la commande : ${missingFields.join(', ')}`,
      422
    );
    error.missingFields = missingFields;
    throw error;
  }

  // 3. Acquire row lock on the draft to prevent concurrent confirmation
  return runInTransaction(async (tx) => {
    const lockedDraft = await draftRepository.findDraftByIdForUpdate(id, tx);
    if (!lockedDraft) {
      throw new AppError('Brouillon non trouvé', 404);
    }

    if (lockedDraft.convertedOrderId || lockedDraft.convertedAt) {
      throw new AppError('Ce brouillon a déjà été confirmé et transformé en commande.', 409);
    }

    // Secondary State D check within transaction
    const txRecordedOrderId = await draftRepository.findConversionOrderIdByDraftId(id, tx);
    if (txRecordedOrderId) {
      const existingOrder = await orderRepository.findById(txRecordedOrderId, tx);
      if (existingOrder) {
        await draftRepository.markConverted(id, existingOrder.id, tx);
        return existingOrder;
      }
    }

    // Re-verify validation with locked draft data
    const lockedMissing = validateDraftForConfirmation(lockedDraft);
    if (lockedMissing.length > 0) {
      const error = new AppError(
        `Impossible de confirmer la commande : ${lockedMissing.join(', ')}`,
        422
      );
      error.missingFields = lockedMissing;
      throw error;
    }

    // 4. Format payload for existing Manual Orders flow
    // Notes are internal draft metadata and strictly NOT sent to createManualOrder
    const resolvedGov = resolveGovernorateSync(lockedDraft.governorate.trim());
    if (!resolvedGov) {
      throw new AppError('Gouvernorat invalide pour confirmation du brouillon', 400);
    }

    const items = lockedDraft.items
      .filter((line) => line.variantId)
      .map((line) => ({
        variantId: line.variantId,
        quantity: Math.max(1, parseInt(line.quantity, 10) || 1),
      }));

    const payload = {
      customerName: lockedDraft.customerName.trim(),
      phoneNumber: lockedDraft.phoneNumber.trim(),
      governorateId: resolvedGov.id,
      governorate: resolvedGov.name,
      shippingAddress: lockedDraft.shippingAddress.trim(),
      items,
    };

    if (lockedDraft.customerEmail?.trim()) {
      payload.customerEmail = lockedDraft.customerEmail.trim();
    }

    if (lockedDraft.deliveryFee !== null && lockedDraft.deliveryFee !== undefined && lockedDraft.deliveryFee !== '') {
      payload.deliveryFee = Number(lockedDraft.deliveryFee);
    }

    // 5. Delegate order creation to existing authoritative Manual Order service
    // This executes its own transaction, locks inventory, deducts stock, and creates the real order.
    let createdOrder = null;
    try {
      createdOrder = await adminService.createManualOrder(payload);
    } catch (orderErr) {
      // Order creation failed -> throw error to rollback draft lock transaction.
      // Draft remains unconverted and editable, zero real orders created.
      throw orderErr;
    }

    // 6. Record conversion in persistent journal for State D recovery
    try {
      await draftRepository.recordDraftConversion(id, createdOrder.id);
    } catch (journalErr) {
      console.error(`[draft.service] Warning: Journal record error for draft ${id}:`, journalErr.message);
    }

    // 7. Persist conversion on the draft
    try {
      await draftRepository.markConverted(id, createdOrder.id, tx);
    } catch (markErr) {
      console.error(`[draft.service] Warning: Error marking draft ${id} converted:`, markErr.message);
      // Attempt immediate out-of-transaction retries to ensure convertedOrderId is recorded
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await draftRepository.markConverted(id, createdOrder.id);
          break;
        } catch (retryErr) {
          console.error(`[draft.service] Retry ${attempt} failed:`, retryErr.message);
        }
      }
    }

    return createdOrder;
  });
}
