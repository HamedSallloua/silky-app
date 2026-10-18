import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/auth.css';

export default function Signup() {
  const navigate = useNavigate();
  const { isAuthenticated, register } = useAuth();

  const [form, setForm] = useState({ prenom: '', nom: '', identifier: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return null;
  }

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

    const trimmedId = (form.identifier || '').trim();
    if (!trimmedId) {
      errors.identifier = "L'adresse e-mail ou le numéro de téléphone est obligatoire.";
    } else if (trimmedId.includes('@')) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedId)) {
        errors.identifier = 'Veuillez entrer une adresse e-mail valide.';
      }
    } else {
      if (!/^\d{8}$/.test(trimmedId)) {
        errors.identifier = 'Le numéro de téléphone doit contenir exactement 8 chiffres.';
      }
    }

    const passwordVal = form.password || '';
    if (!passwordVal) {
      errors.password = 'Le mot de passe est obligatoire.';
    } else if (passwordVal.length < 8) {
      errors.password = 'Le mot de passe doit contenir au moins 8 caractères.';
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isAuthenticated) return;
    setError('');

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setLoading(true);

    try {
      await register({
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        identifier: form.identifier.trim(),
        password: form.password,
      });
      navigate('/account', { replace: true });
    } catch (err) {
      setError(err.message || 'Création de compte impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <section className="contact-section">
        <img src="/pictures/logo.png" alt="Silky" className="auth-logo" />
        <h2 className="contact-title">Créer un compte</h2>

        <form className="contact-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="prenom">Prénom</label>
            <input
              type="text"
              id="prenom"
              name="prenom"
              value={form.prenom}
              onChange={handleChange}
              className={fieldErrors.prenom ? 'input-error' : ''}
              autoComplete="given-name"
            />
            {fieldErrors.prenom && <span className="field-error-msg">{fieldErrors.prenom}</span>}
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
              autoComplete="family-name"
            />
            {fieldErrors.nom && <span className="field-error-msg">{fieldErrors.nom}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="identifier">Adresse e-mail ou téléphone</label>
            <input
              type="text"
              id="identifier"
              name="identifier"
              value={form.identifier}
              onChange={handleChange}
              className={fieldErrors.identifier ? 'input-error' : ''}
              autoComplete="username"
            />
            {fieldErrors.identifier && (
              <span className="field-error-msg">{fieldErrors.identifier}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="password">Mot de passe</label>
            <input
              type="password"
              id="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              className={fieldErrors.password ? 'input-error' : ''}
              autoComplete="new-password"
            />
            {fieldErrors.password && <span className="field-error-msg">{fieldErrors.password}</span>}
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Création...' : 'Créer'}
            </button>
            <Link to="/login" className="secondary-btn">
              Déjà un compte ?
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
