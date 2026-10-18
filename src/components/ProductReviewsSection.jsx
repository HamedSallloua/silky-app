import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import AdminProductReviewsSection from './AdminProductReviewsSection';
import '../styles/product-reviews.css';

export default function ProductReviewsSection({ productId }) {
  const { user, isAuthenticated, isAdmin } = useAuth();

  const [reviews, setReviews] = useState([]);
  const [summary, setRatingSummary] = useState({ average: 0, count: 0 });
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ authorName: '', email: '', rating: 5, comment: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const fetchReviews = async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const data = await api.getProductReviews(productId);
      if (data) {
        setReviews(data.reviews || []);
        setRatingSummary(data.summary || { average: 0, count: 0 });
      }
    } catch {
      /* fallback empty */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [productId]);

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

    const trimmedComment = (form.comment || '').trim();
    if (!trimmedComment) {
      errors.comment = "L'avis est obligatoire.";
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isAdmin) {
      setMessage('Les administrateurs ne peuvent pas soumettre d\'avis.');
      setMessageType('error');
      return;
    }

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setMessage('');
    setFieldErrors({});

    const finalAuthorName = isAuthenticated
      ? (user?.fullName || user?.full_name || user?.name || 'Client')
      : form.authorName.trim();
    const finalEmail = isAuthenticated
      ? (user?.email || form.email.trim())
      : form.email.trim();

    try {
      await api.submitProductReview(productId, {
        authorName: finalAuthorName,
        email: finalEmail,
        rating: Number(form.rating),
        comment: form.comment.trim(),
      });
      setMessage('Votre avis a été soumis avec succès. Il sera affiché après validation.');
      setMessageType('success');
      setForm({ authorName: '', email: '', rating: 5, comment: '' });
    } catch (err) {
      setMessage(err.message || 'Erreur lors de la soumission de l\'avis.');
      setMessageType('error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="product_reviews_section" aria-label="Avis produit">
      <div className="product_reviews_container" id="product_reviews_container">
        <h2 className="product_reviews_heading">AVIS SUR CE PRODUIT</h2>

        <div className="product_reviews_summary_header">
          {summary.count > 0 ? (
            <div className="product_rating_badge">
              <span className="rating_number">{summary.average}/5</span>
              <span className="rating_stars">
                {'★'.repeat(Math.round(summary.average))}
                {'☆'.repeat(5 - Math.round(summary.average))}
              </span>
              <span className="rating_count">({summary.count} avis)</span>
            </div>
          ) : (
            <div className="no_rating_badge">
              <span>Aucun avis pour ce produit pour le moment. Soyez le premier !</span>
            </div>
          )}
        </div>

        <div className="product_reviews_layout">
          {/* Reviews list */}
          <div className="product_reviews_list_wrapper">
            {loading ? (
              <p className="loading_text">Chargement des avis...</p>
            ) : reviews.length === 0 ? (
              <div className="empty_reviews_box">
                <p>Aucun avis publié sur ce produit.</p>
              </div>
            ) : (
              <div className="product_reviews_cards">
                {reviews.map((rev) => (
                  <article key={rev.id} className="product_review_card">
                    <div className="product_review_card_header">
                      <strong className="review_author">{rev.authorName || 'Client'}</strong>
                      <span className="review_stars">
                        {'★'.repeat(rev.rating)}
                        {'☆'.repeat(5 - rev.rating)}
                      </span>
                    </div>
                    <p className="review_text">{rev.comment || rev.body}</p>
                    <time className="review_date">
                      {new Date(rev.createdAt).toLocaleDateString('fr-FR')}
                    </time>
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* Compact Review Form */}
          <div className="product_review_form_wrapper">
            <h3 className="compact_form_title">Donner votre avis</h3>

            {isAdmin ? (
              <p className="admin_notice_text">
                Les administrateurs ne peuvent pas soumettre d&apos;avis produit.
              </p>
            ) : (
              <form className="compact_review_form" onSubmit={handleSubmit} noValidate>
                {!isAuthenticated && (
                  <div className="compact_form_group">
                    <label htmlFor="product_review_author">Votre nom *</label>
                    <input
                      id="product_review_author"
                      type="text"
                      value={form.authorName}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, authorName: e.target.value }));
                        if (fieldErrors.authorName) setFieldErrors((f) => ({ ...f, authorName: '' }));
                      }}
                      placeholder="Entrez votre nom"
                      className={fieldErrors.authorName ? 'input-error' : ''}
                    />
                    {fieldErrors.authorName && (
                      <span className="field-error-msg">{fieldErrors.authorName}</span>
                    )}
                  </div>
                )}

                {!isAuthenticated && (
                  <div className="compact_form_group">
                    <label htmlFor="product_review_email">Votre e-mail (optionnel)</label>
                    <input
                      id="product_review_email"
                      type="email"
                      value={form.email}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, email: e.target.value }));
                        if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: '' }));
                      }}
                      placeholder="Entrez votre e-mail"
                      className={fieldErrors.email ? 'input-error' : ''}
                    />
                    {fieldErrors.email && (
                      <span className="field-error-msg">{fieldErrors.email}</span>
                    )}
                  </div>
                )}

                <div className="compact_form_group">
                  <label htmlFor="product_review_rating">Note *</label>
                  <select
                    id="product_review_rating"
                    value={form.rating}
                    onChange={(e) => setForm((f) => ({ ...f, rating: Number(e.target.value) }))}
                  >
                    <option value={5}>★★★★★ (5/5)</option>
                    <option value={4}>★★★★☆ (4/5)</option>
                    <option value={3}>★★★☆☆ (3/5)</option>
                    <option value={2}>★★☆☆☆ (2/5)</option>
                    <option value={1}>★☆☆☆☆ (1/5)</option>
                  </select>
                </div>

                <div className="compact_form_group">
                  <label htmlFor="product_review_comment">Votre avis *</label>
                  <textarea
                    id="product_review_comment"
                    rows={4}
                    value={form.comment}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, comment: e.target.value }));
                      if (fieldErrors.comment) setFieldErrors((f) => ({ ...f, comment: '' }));
                    }}
                    placeholder="Partagez votre avis sur la coupe, la qualité..."
                    className={fieldErrors.comment ? 'input-error' : ''}
                  />
                  {fieldErrors.comment && (
                    <span className="field-error-msg">{fieldErrors.comment}</span>
                  )}
                </div>

                {message && (
                  <p className={`form_message ${messageType}`}>{message}</p>
                )}

                <button type="submit" className="compact_submit_btn" disabled={submitting}>
                  {submitting ? 'Envoi...' : 'Envoyer mon avis'}
                </button>
              </form>
            )}
          </div>
        </div>

        {isAdmin && (
          <AdminProductReviewsSection
            productId={productId}
            onReviewUpdated={fetchReviews}
          />
        )}
      </div>
    </section>
  );
}
