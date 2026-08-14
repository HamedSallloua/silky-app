const API_BASE = '/api';



const GUEST_SESSION_KEY = 'silky_guest_session_id';

const USER_TOKEN_KEY = 'silky_auth_token';

const USER_KEY = 'silky_auth_user';



export function getUserToken() {

  return localStorage.getItem(USER_TOKEN_KEY);

}



export function setUserAuth(token, user) {

  if (token) {

    localStorage.setItem(USER_TOKEN_KEY, token);

    localStorage.setItem(USER_KEY, JSON.stringify(user));

  } else {

    localStorage.removeItem(USER_TOKEN_KEY);

    localStorage.removeItem(USER_KEY);

  }

}



export function clearUserAuth() {

  setUserAuth(null);

  window.dispatchEvent(new Event('silky:auth-expired'));

}



export function getStoredUser() {

  try {

    const raw = localStorage.getItem(USER_KEY);

    return raw ? JSON.parse(raw) : null;

  } catch {

    return null;

  }

}



function getGuestSessionId() {

  return localStorage.getItem(GUEST_SESSION_KEY);

}



function setGuestSessionId(id) {

  if (id) localStorage.setItem(GUEST_SESSION_KEY, id);

}



async function request(path, options = {}) {

  const headers = { ...options.headers };

  if (options.body && !(options.body instanceof FormData)) {

    headers['Content-Type'] = 'application/json';

  }



  const userToken = getUserToken();

  if (userToken) headers.Authorization = `Bearer ${userToken}`;



  const guestSessionId = getGuestSessionId();

  if (guestSessionId) {

    headers['X-Guest-Session-ID'] = guestSessionId;

  }



  const res = await fetch(`${API_BASE}${path}`, {

    ...options,

    headers,

    credentials: 'include',

    body:

      options.body instanceof FormData || typeof options.body === 'string'

        ? options.body

        : options.body

          ? JSON.stringify(options.body)

          : undefined,

  });



  const newGuestSession = res.headers.get('X-Guest-Session-ID');

  if (newGuestSession) {

    setGuestSessionId(newGuestSession);

  }



  if (!res.ok) {

    const err = await res.json().catch(() => ({ error: res.statusText }));

    // Only auto-logout on 401 for general auth failures (expired/invalid session).
    // Credential-validation endpoints (change-password, admin login) legitimately
    // return 401 for wrong credentials — they should NOT clear the current session.
    const isCredentialValidation =
      path === '/auth/change-password' || path === '/admin/login';

    if (res.status === 401 && getUserToken() && !isCredentialValidation) {

      clearUserAuth();

      throw new Error(err.error || 'Session expirée. Veuillez vous reconnecter.');

    }

    throw new Error(err.error || 'Request failed');

  }



  return res.json();

}



export const api = {

  // Customer auth

  register: (data) => request('/auth/register', { method: 'POST', body: data }),

  login: (data) => request('/auth/login', { method: 'POST', body: data }),

  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: { email } }),

  resetPassword: (data) => request('/auth/reset-password', { method: 'POST', body: data }),

  getMe: () => request('/auth/me'),

  updateProfile: (data) => request('/auth/me', { method: 'PATCH', body: data }),

  changePassword: (data) => request('/auth/change-password', { method: 'POST', body: data }),



  // Admin panel (password login → JWT)

  adminLogin: (password) => request('/admin/login', { method: 'POST', body: { password } }),

  adminLogout: () => request('/admin/logout', { method: 'POST' }),

  getAdminInventory: () => request('/admin/inventory'),

  updateAdminInventory: (variantId, stockQuantity) =>
    request(`/admin/inventory/${variantId}`, { method: 'PATCH', body: { stockQuantity } }),

  createManualOrder: (data) => request('/admin/orders/manual', { method: 'POST', body: data }),

  previewExchange: (orderId, data) => request(`/admin/orders/${orderId}/exchange/preview`, { method: 'POST', body: data }),

  createExchange: (orderId, data) => request(`/admin/orders/${orderId}/exchange`, { method: 'POST', body: data }),

  getAdminAnalytics: (params) => {
    const query = new URLSearchParams();
    if (params?.granularity) query.set('granularity', params.granularity);
    if (params?.limit) query.set('limit', String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request(`/admin/analytics${suffix}`);
  },



  getTheme: () => request('/theme'),

  updateTheme: (theme) => request('/theme', { method: 'PUT', body: theme }),

  uploadThemeImage: (formData) => request('/theme/upload', { method: 'POST', body: formData }),



  getProducts: (params) => {

    const query = new URLSearchParams();

    if (params?.category) query.set('category', params.category);

    if (params?.search) query.set('search', params.search);

    if (params?.page) query.set('page', String(params.page));

    if (params?.limit) query.set('limit', String(params.limit));

    if (params?.includeHidden) query.set('includeHidden', 'true');

    const suffix = query.toString() ? `?${query.toString()}` : '';

    return request(`/products${suffix}`);

  },

  getProduct: (id) => request(`/products/${id}`),

  getProductReviews: (id) => request(`/products/${id}/reviews`),

  submitProductReview: (id, review) =>

    request(`/products/${id}/reviews`, { method: 'POST', body: review }),



  getCart: () => request('/cart'),

  addCartItem: (item) => request('/cart/items', { method: 'POST', body: item }),

  removeCartItem: (id) => request(`/cart/items/${id}`, { method: 'DELETE' }),



  getFavourites: () => request('/favourites'),

  toggleFavourite: (productId) =>

    request('/favourites/toggle', { method: 'POST', body: { productId } }),



  checkout: (customer) => request('/orders/checkout', { method: 'POST', body: { customer } }),

  createProduct: (product) => request('/products', { method: 'POST', body: product }),

  updateProduct: (id, product) => request(`/products/${id}`, { method: 'PUT', body: product }),

  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),

  uploadProductImage: (formData) => request('/products/upload', { method: 'POST', body: formData }),



  getOrders: () => request('/orders'),

  getMyOrders: () => request('/orders/mine'),

  getOrder: (id) => request(`/orders/${id}`),

  createOrder: (order) => request('/orders', { method: 'POST', body: order }),

  updateOrderStatus: (id, status) => request(`/orders/${id}/status`, { method: 'PATCH', body: { status } }),

  updateOrdersStatus: (orderIds, status) => request('/orders/bulk-status', { method: 'PATCH', body: { orderIds, status } }),

  cancelOrder: (id) => request(`/orders/${id}/cancel`, { method: 'POST' }),



  getPublishedReviews: () => request('/reviews/published'),

  submitReview: (review) => request('/reviews', { method: 'POST', body: review }),

  getAllReviews: () => request('/reviews'),

  updateReviewStatus: (id, status) => request(`/reviews/${id}`, { method: 'PATCH', body: { status } }),

  deleteReview: (id) => request(`/reviews/${id}`, { method: 'DELETE' }),



  getAdminProductReviews: (productId) => request(`/products/${productId}/admin-reviews`),

  updateAdminProductReview: (id, data) => request(`/products/reviews/${id}`, { method: 'PATCH', body: data }),

  deleteAdminProductReview: (id) => request(`/products/reviews/${id}`, { method: 'DELETE' }),

  getGallery: () => request('/gallery'),

  addGalleryItem: (formData) => request('/gallery', { method: 'POST', body: formData }),

  deleteGalleryItem: (id) => request(`/gallery/${id}`, { method: 'DELETE' }),

};

