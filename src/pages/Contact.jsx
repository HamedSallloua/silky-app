import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import '../styles/contact.css';

export default function Contact() {
  const { user, isAdmin } = useAuth();
  const [form, setForm] = useState({
    prenom: '',
    nom: '',
    email: user?.email || '',
    message: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.email) {
      setForm((prev) => ({
        ...prev,
        email: prev.email || user.email,
      }));
    }
  }, [user?.email]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const errors = {};

    const trimmedPrenom = (form.prenom || '').trim();
    if (!trimmedPrenom) {
      errors.prenom = 'Le prénom est obligatoire.';
    } else if (trimmedPrenom.length < 3) {
      errors.prenom = 'Le prénom doit contenir au moins 3 lettres.';
    } else if (trimmedPrenom.length > 35) {
      errors.prenom = 'Le prénom ne doit pas dépasser 35 lettres.';
    }

    const trimmedNom = (form.nom || '').trim();
    if (!trimmedNom) {
      errors.nom = 'Le nom est obligatoire.';
    } else if (trimmedNom.length < 3) {
      errors.nom = 'Le nom doit contenir au moins 3 lettres.';
    } else if (trimmedNom.length > 35) {
      errors.nom = 'Le nom ne doit pas dépasser 35 lettres.';
    }

    const trimmedEmail = (form.email || '').trim();
    if (!trimmedEmail) {
      errors.email = "L'adresse e-mail est obligatoire.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Veuillez entrer une adresse e-mail valide.';
    }

    const trimmedMessage = (form.message || '').trim();
    if (!trimmedMessage) {
      errors.message = 'Le message est obligatoire.';
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isAdmin) {
      setError("Les administrateurs ne peuvent pas envoyer de messages de contact.");
      return;
    }

    setSuccess('');
    setError('');

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    try {
      await api.submitContactMessage({
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        email: form.email.trim(),
        message: form.message.trim(),
      });
      setSuccess('Votre message a été envoyé avec succès. Nous vous répondrons dans les plus brefs délais.');
      setForm({
        prenom: '',
        nom: '',
        email: user?.email || '',
        message: '',
      });
    } catch (err) {
      setError(err.message || "Une erreur est survenue lors de l'envoi du message.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isAdmin) {
    return (
      <main>
        <section className="contact-section">
          <div className="contact-container" style={{ textAlign: 'center' }}>
            <h2 className="contact-title">Contactez-nous</h2>
            <p className="form-error" style={{ fontSize: 16, marginTop: 24 }}>
              Les administrateurs ne peuvent pas envoyer de messages de contact.
            </p>
            <div style={{ marginTop: 24 }}>
              <Link to="/admin" className="submit-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
                Retour au panneau d&apos;administration
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="contact-section">
        <div className="contact-container">
          <h2 className="contact-title">Contactez-nous</h2>

          <div className="contact-intro">
            <p>
              Chez Silky, nous sommes toujours à votre écoute pour vous offrir une expérience shopping sur mesure.
            </p>
            <p>
              Pour toute question, suggestion ou besoin d&apos;aide, notre équipe reste à votre entière disposition.
              N&apos;hésitez pas à nous contacter !
            </p>
          </div>

          <form className="contact-form" onSubmit={handleSubmit} noValidate>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="prenom">Prénom</label>
                <input
                  type="text"
                  id="prenom"
                  name="prenom"
                  value={form.prenom}
                  onChange={handleChange}
                  className={fieldErrors.prenom ? 'input-error' : ''}
                />
                {fieldErrors.prenom && (
                  <span className="field-error-msg">{fieldErrors.prenom}</span>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="nom">Nom</label>
                <input
                  type="text"
                  id="nom"
                  name="nom"
                  value={form.nom}
                  onChange={handleChange}
                  className={fieldErrors.nom ? 'input-error' : ''}
                />
                {fieldErrors.nom && (
                  <span className="field-error-msg">{fieldErrors.nom}</span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="email">Adresse e-mail</label>
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
              <label htmlFor="message">Votre message</label>
              <textarea
                id="message"
                name="message"
                rows={6}
                value={form.message}
                onChange={handleChange}
                className={fieldErrors.message ? 'input-error' : ''}
              />
              {fieldErrors.message && (
                <span className="field-error-msg">{fieldErrors.message}</span>
              )}
            </div>

            {error && <p className="form-error">{error}</p>}
            {success && <p className="form-success">{success}</p>}

            <div className="form-actions">
              <button type="submit" className="submit-btn" disabled={submitting}>
                {submitting ? 'Envoi...' : 'Envoyer'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
