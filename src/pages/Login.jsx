import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/auth.css';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, login } = useAuth();

  const [form, setForm] = useState({ identifier: '', password: '' });
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
      const result = await login({
        identifier: form.identifier.trim(),
        password: form.password,
      });
      const defaultPath = result.user?.role === 'admin' ? '/admin' : '/account';
      let redirectTo = location.state?.from || defaultPath;
      if (result.user?.role === 'admin' && redirectTo === '/account') {
        redirectTo = '/admin';
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message || 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <section className="contact-section">
        <img src="/pictures/logo.png" alt="Silky" className="auth-logo" />
        <h2 className="contact-title">Connexion</h2>

        <form className="contact-form" onSubmit={handleSubmit} noValidate>
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
            <div className="label-row">
              <label htmlFor="password">Mot de passe</label>
              <Link to="/password-reset" className="forgot-link">
                Mot de passe oublié?
              </Link>
            </div>
            <input
              type="password"
              id="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              className={fieldErrors.password ? 'input-error' : ''}
              autoComplete="current-password"
            />
            {fieldErrors.password && <span className="field-error-msg">{fieldErrors.password}</span>}
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
            <Link to="/signup" className="secondary-btn">
              Créer un compte
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
