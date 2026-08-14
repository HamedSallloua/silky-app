import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useProducts } from '../context/ProductsContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { formatPrice } from '../utils/formatPrice';
import '../styles/checkout.css';

const TUNISIAN_GOVERNORATES = [
  'Ariana',
  'Béja',
  'Ben Arous',
  'Bizerte',
  'Gabès',
  'Gafsa',
  'Jendouba',
  'Kairouan',
  'Kasserine',
  'Kébili',
  'Kef',
  'Mahdia',
  'Manouba',
  'Médenine',
  'Monastir',
  'Nabeul',
  'Sfax',
  'Sidi Bouzid',
  'Siliana',
  'Sousse',
  'Tataouine',
  'Tozeur',
  'Tunis',
  'Zaghouan',
];

export default function Checkout() {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const { items, subtotal, deliveryFee, total, refreshCart, loading } = useCart();
  const { refreshProducts } = useProducts();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    governorate: '',
    address: '',
  });

  // Prefill phone from saved account number when user is logged in
  useEffect(() => {
    if (user?.phoneNumber) {
      const digits = user.phoneNumber.replace(/\D/g, '').slice(0, 8);
      setForm((prev) => ({ ...prev, phone: digits }));
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      const numericValue = value.replace(/\D/g, '').slice(0, 8);
      setForm((prev) => ({ ...prev, phone: numericValue }));
      if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: '' }));
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const validateForm = () => {
    const errors = {};

    const trimmedFirstName = (form.firstName || '').trim();
    if (!trimmedFirstName) {
      errors.firstName = 'Le prénom est obligatoire.';
    } else if (trimmedFirstName.length < 3) {
      errors.firstName = 'Le prénom doit contenir au moins 3 lettres.';
    } else if (trimmedFirstName.length > 35) {
      errors.firstName = 'Le prénom ne doit pas dépasser 35 lettres.';
    }

    const trimmedLastName = (form.lastName || '').trim();
    if (!trimmedLastName) {
      errors.lastName = 'Le nom est obligatoire.';
    } else if (trimmedLastName.length < 3) {
      errors.lastName = 'Le nom doit contenir au moins 3 lettres.';
    } else if (trimmedLastName.length > 35) {
      errors.lastName = 'Le nom ne doit pas dépasser 35 lettres.';
    }

    const trimmedEmail = (form.email || '').trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = "Veuillez entrer une adresse e-mail valide.";
    }

    const trimmedPhone = (form.phone || '').trim();
    if (!trimmedPhone) {
      errors.phone = 'Le numéro de téléphone est obligatoire.';
    } else if (!/^\d{8}$/.test(trimmedPhone)) {
      errors.phone = 'Le numéro de téléphone doit contenir exactement 8 chiffres.';
    }

    if (!form.governorate) {
      errors.governorate = 'Veuillez sélectionner un gouvernorat.';
    }

    const trimmedAddress = (form.address || '').trim();
    if (!trimmedAddress) {
      errors.address = "L'adresse de livraison est obligatoire.";
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isAdmin) {
      setError('Les administrateurs ne peuvent pas passer de commandes.');
      return;
    }
    if (!items.length) return;

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setError('');
    setFieldErrors({});

    const fullShippingAddress = `${form.governorate} — ${form.address.trim()}`;

    try {
      const order = await api.checkout({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim(),
        address: fullShippingAddress,
      });
      await refreshCart();
      await refreshProducts();
      navigate('/order-confirmation', { state: { order } });
      await refreshCart();
      await refreshProducts();
      navigate('/order-confirmation', { state: { order } });
    } catch (err) {
      setError(err.message || 'Impossible de finaliser la commande');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="checkout-page">
        <section className="checkout-section">
          <h1 className="checkout-title">Finaliser la commande</h1>
          <p className="checkout-empty">Chargement du panier...</p>
        </section>
      </main>
    );
  }

  if (isAdmin) {
    return (
      <main className="checkout-page">
        <section className="checkout-section">
          <h1 className="checkout-title">Finaliser la commande</h1>
          <p className="checkout-empty" style={{ color: '#b00020' }}>
            Les administrateurs ne peuvent pas passer de commandes client.
          </p>
          <Link to="/admin" className="checkout-back-link" style={{ display: 'inline-block', marginTop: 16 }}>
            Retour au panneau d&apos;administration
          </Link>
        </section>
      </main>
    );
  }

  if (!items.length) {
    return (
      <main className="checkout-page">
        <section className="checkout-section">
          <h1 className="checkout-title">Finaliser la commande</h1>
          <p className="checkout-empty">Votre panier est vide.</p>
          <Link to="/" className="checkout-back-link">
            Retour à la boutique
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="checkout-page">
      <section className="checkout-section">
        <h1 className="checkout-title">Finaliser la commande</h1>

        <div className="checkout-layout">
          <form className="checkout-form" onSubmit={handleSubmit} noValidate>
            <h2>Informations de livraison</h2>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="firstName">Prénom *</label>
                <input
                  id="firstName"
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                  className={fieldErrors.firstName ? 'input-error' : ''}
                />
                {fieldErrors.firstName && (
                  <span className="field-error-msg">{fieldErrors.firstName}</span>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="lastName">Nom *</label>
                <input
                  id="lastName"
                  name="lastName"
                  value={form.lastName}
                  onChange={handleChange}
                  className={fieldErrors.lastName ? 'input-error' : ''}
                />
                {fieldErrors.lastName && (
                  <span className="field-error-msg">{fieldErrors.lastName}</span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="email">Adresse e-mail <span style={{ fontWeight: 400, opacity: 0.65, fontSize: '0.85em' }}>(facultatif)</span></label>
              <input
                type="email"
                id="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className={fieldErrors.email ? 'input-error' : ''}
              />
              {fieldErrors.email && (
                <span className="field-error-msg">{fieldErrors.email}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="phone">Téléphone (8 chiffres) *</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                inputMode="numeric"
                maxLength={8}
                value={form.phone}
                onChange={handleChange}
                className={fieldErrors.phone ? 'input-error' : ''}
              />
              {fieldErrors.phone && (
                <span className="field-error-msg">{fieldErrors.phone}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="governorate">Gouvernorat *</label>
              <select
                id="governorate"
                name="governorate"
                value={form.governorate}
                onChange={handleChange}
                className={fieldErrors.governorate ? 'input-error' : ''}
              >
                <option value="">Sélectionner un gouvernorat *</option>
                {TUNISIAN_GOVERNORATES.map((gov) => (
                  <option key={gov} value={gov}>
                    {gov}
                  </option>
                ))}
              </select>
              {fieldErrors.governorate && (
                <span className="field-error-msg">{fieldErrors.governorate}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="address">Adresse (rue, quartier, etc.) *</label>
              <textarea
                id="address"
                name="address"
                rows={3}
                placeholder="Rue, quartier, bâtiment, appartement..."
                value={form.address}
                onChange={handleChange}
                className={fieldErrors.address ? 'input-error' : ''}
              />
              {fieldErrors.address && (
                <span className="field-error-msg">{fieldErrors.address}</span>
              )}
            </div>

            {error && <p className="checkout-error">{error}</p>}

            <button type="submit" className="checkout-submit" disabled={submitting}>
              {submitting ? 'Confirmation...' : 'Confirmer la commande'}
            </button>
          </form>

          <aside className="checkout-summary">
            <h2>Récapitulatif</h2>
            <ul className="checkout-items">
              {items.map((item) => (
                <li key={item.cartItemId}>
                  <span>
                    {item.name} × {item.quantity}
                    {item.details ? ` (${item.details})` : ''}
                  </span>
                  <span>{formatPrice(item.price * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="checkout-row">
              <span>Sous-total</span>
              <strong>{formatPrice(subtotal)}</strong>
            </div>
            <div className="checkout-row">
              <span>Livraison</span>
              <strong>{formatPrice(deliveryFee)}</strong>
            </div>
            <div className="checkout-row checkout-total">
              <span>Total (TTC)</span>
              <strong>{formatPrice(total)}</strong>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
