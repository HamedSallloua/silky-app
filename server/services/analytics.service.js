import { analyticsRepository } from '../repositories/analytics.repository.js';

export async function getAnalytics({ granularity = 'daily', limit = 30, piePeriod = 'year' } = {}) {
  return analyticsRepository.getAnalytics({ granularity, limit, piePeriod });
}
