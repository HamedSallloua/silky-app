import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import '../styles/pwreset.css';

export default function PasswordReset() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const { token } = useParams();
  const isResetStep = Boolean(token);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return null;
  }

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    if (fieldErrors.email) {
      setFieldErrors((prev) => ({ ...prev, email: '' }));
    }
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    if (fieldErrors.password) {
      setFieldErrors((prev) => ({ ...prev, password: '' }));
    }
  };

  const handleConfirmPasswordChange = (e) => {
    setConfirmPassword(e.target.value);
    if (fieldErrors.confirmPassword) {
      setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }));
    }
  };

  const validateForgotForm = () => {
    const errors = {};
    const trimmedEmail = (email || '').trim();
    if (!trimmedEmail) {
      errors.email = "L'adresse e-mail est obligatoire.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Veuillez entrer une adresse e-mail valide.';
    }
    return errors;
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (isAuthenticated) return;
    setError('');
    setMessage('');

    const errors = validateForgotForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setLoading(true);

    try {
      const result = await api.forgotPassword(email.trim());

      if (result.resetToken) {
        // Dev / no-SMTP mode: show the token so it can be tested locally
        setMessage(
          `(dev) Token: ${result.resetToken} — utilisez /password-reset/${result.resetToken}`,
        );
      } else {
        // Real email sent — show a clean confirmation
        setMessage(
          'Un e-mail vous a été envoyé. Vérifiez votre boîte de réception et suivez le lien pour réinitialiser votre mot de passe.',
        );
      }
    } catch (err) {
      setError(err.message || 'Envoi impossible');
    } finally {
      setLoading(false);
    }
  };

  const validateResetForm = () => {
    const errors = {};

    if (!password) {
      errors.password = 'Le mot de passe est obligatoire.';
    } else if (password.length < 8) {
      errors.password = 'Le mot de passe doit contenir au moins 8 caractères.';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Veuillez confirmer le mot de passe.';
    } else if (confirmPassword.length < 8) {
      errors.confirmPassword = 'Le mot de passe doit contenir au moins 8 caractères.';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Les mots de passe ne correspondent pas.';
    }

    return errors;
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (isAuthenticated) return;
    setError('');
    setMessage('');

    const errors = validateResetForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setLoading(true);

    try {
      const result = await api.resetPassword({ token, newPassword: password });
      setMessage(result.message);
    } catch (err) {
      setError(err.message || 'Réinitialisation impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <section className="contact-section">
        <img src="/pictures/logo.png" alt="Silky" className="auth-logo" />
        <h1 className="contact-title">Connexion</h1>
        <h2 className="reset-subtitle">
          {isResetStep ? 'Choisissez un nouveau mot de passe' : 'Réinitialiser votre mot de passe'}
        </h2>

        {!isResetStep && (
          <div className="reset-intro">
            <p>Entrez votre adresse e-mail.</p>
            <p>Nous vous envoyons un e-mail pour réinitialiser votre mot de passe.</p>
          </div>
        )}

        {isResetStep ? (
          <form className="contact-form" onSubmit={handleResetSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="password">Nouveau mot de passe</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={handlePasswordChange}
                className={fieldErrors.password ? 'input-error' : ''}
                autoComplete="new-password"
              />
              {fieldErrors.password && (
                <span className="field-error-msg">{fieldErrors.password}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirmer le mot de passe</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={handleConfirmPasswordChange}
                className={fieldErrors.confirmPassword ? 'input-error' : ''}
                autoComplete="new-password"
              />
              {fieldErrors.confirmPassword && (
                <span className="field-error-msg">{fieldErrors.confirmPassword}</span>
              )}
            </div>

            {error && <p className="form-error">{error}</p>}
            {message && <p className="form-success">{message}</p>}

            <div className="form-actions">
              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              <Link to="/login" className="cancel-link">
                Retour à la connexion
              </Link>
            </div>
          </form>
        ) : (
          <form className="contact-form" onSubmit={handleForgotSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="email">Adresse e-mail</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={handleEmailChange}
                className={fieldErrors.email ? 'input-error' : ''}
                autoComplete="email"
              />
              {fieldErrors.email && (
                <span className="field-error-msg">{fieldErrors.email}</span>
              )}
            </div>

            {error && <p className="form-error">{error}</p>}
            {message && <p className="form-success">{message}</p>}

            <div className="form-actions">
              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? 'Envoi...' : 'Envoyer'}
              </button>
              <Link to="/login" className="cancel-link">
                Annuler
              </Link>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
