import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import ReviewsSection from '../components/ReviewsSection';
import '../styles/reviews-page.css';
import '../styles/home.css';

export default function LeaveReview() {
  const { user, isAuthenticated, isAdmin } = useAuth();
  const [form, setForm] = useState({ authorName: '', email: '', body: '', rating: 5 });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const errors = {};
    const nameVal = isAuthenticated
      ? (user?.fullName || user?.full_name || user?.name || '')
      : form.authorName;
    const emailVal = isAuthenticated
      ? (user?.email || '')
      : form.email;

    const trimmedName = (nameVal || '').trim();
    if (!trimmedName) {
      errors.authorName = 'Le nom est obligatoire.';
    } else if (trimmedName.length < 3) {
      errors.authorName = 'Le nom doit contenir au moins 3 lettres.';
    } else if (trimmedName.length > 35) {
      errors.authorName = 'Le nom ne doit pas dépasser 35 lettres.';
    }

    const trimmedEmail = (emailVal || '').trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = "Veuillez entrer une adresse e-mail valide.";
    }

    const trimmedBody = (form.body || '').trim();
    if (!trimmedBody) {
      errors.body = "L'avis est obligatoire.";
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isAdmin) {
      setError('Les administrateurs ne peuvent pas soumettre d\'avis.');
      return;
    }

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setError('');
    setFieldErrors({});

    const finalAuthorName = isAuthenticated
      ? (user?.fullName || user?.full_name || user?.name || 'Client')
      : form.authorName.trim();
    const finalEmail = isAuthenticated
      ? (user?.email || form.email.trim())
      : form.email.trim();

    try {
      await api.submitReview({
        ...form,
        authorName: finalAuthorName,
        email: finalEmail,
        body: form.body.trim(),
        rating: Number(form.rating),
      });
      setSuccess(true);
      setForm({ authorName: '', email: '', body: '', rating: 5 });
    } catch (err) {
      setError(err.message || 'Impossible d\'envoyer votre avis');
    } finally {
      setSubmitting(false);
    }
  };

  if (isAdmin) {
    return (
      <>
        <main className="collections_wrapper" style={{ minHeight: 400, paddingTop: 40 }}>
          <h1 className="collection_title">Donner votre avis</h1>
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <p style={{ fontSize: 16, color: '#b00020', marginBottom: 24 }}>
              Les administrateurs ne peuvent pas soumettre d&apos;avis client.
            </p>
            <Link to="/admin" className="tout_button">
              Retour au panneau d&apos;administration
            </Link>
          </div>
        </main>
        <ReviewsSection layout="leave-review" />
      </>
    );
  }

  return (
    <>
      <main className="reviews-page">
        <section className="reviews-page-section">
          <div className="reviews-page-header">
            <img src="/pictures/avis.png" alt="Avis clients Silky" className="reviews-page-logo" />
            <h1>Donner votre avis</h1>
            <p>Partagez votre expérience Silky. Votre avis sera publié après validation par notre équipe.</p>
          </div>

          {success ? (
            <div className="reviews-page-success">
              <h2>Merci!</h2>
              <p>Votre avis a été envoyé et sera visible après approbation.</p>
              <button type="button" className="reviews-page-btn" onClick={() => setSuccess(false)}>
                Envoyer un autre avis
              </button>
              <Link to="/" className="reviews-page-link">
                Retour à l&apos;accueil
              </Link>
            </div>
          ) : (
            <form className="reviews-page-form" onSubmit={handleSubmit} noValidate>
              {!isAuthenticated && (
                <div className="form-group">
                  <label htmlFor="authorName">Votre nom *</label>
                  <input
                    id="authorName"
                    name="authorName"
                    value={form.authorName}
                    onChange={handleChange}
                    className={fieldErrors.authorName ? 'input-error' : ''}
                  />
                  {fieldErrors.authorName && (
                    <span className="field-error-msg">{fieldErrors.authorName}</span>
                  )}
                </div>
              )}

              {!isAuthenticated && (
                <div className="form-group">
                  <label htmlFor="email">E-mail (optionnel)</label>
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
              )}

              <div className="form-group">
                <label htmlFor="rating">Note</label>
                <select id="rating" name="rating" value={form.rating} onChange={handleChange}>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} / 5
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="body">Votre avis *</label>
                <textarea
                  id="body"
                  name="body"
                  rows={6}
                  value={form.body}
                  onChange={handleChange}
                  placeholder="Décrivez votre expérience avec Silky..."
                  className={fieldErrors.body ? 'input-error' : ''}
                />
                {fieldErrors.body && (
                  <span className="field-error-msg">{fieldErrors.body}</span>
                )}
              </div>

              {error && <p className="reviews-page-error">{error}</p>}

              <button type="submit" className="reviews-page-btn" disabled={submitting}>
                {submitting ? 'Envoi...' : 'Envoyer mon avis'}
              </button>
            </form>
          )}
        </section>
      </main>

      <ReviewsSection layout="leave-review" />
    </>
  );
}

