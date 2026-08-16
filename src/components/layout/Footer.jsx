import { Link } from 'react-router-dom';

export default function Footer() {
  const handleNavClick = (targetPath) => {
    const [, hash] = (targetPath || '').split('#');
    if (hash) {
      const element = document.getElementById(hash);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }
  };

  return (
    <footer className="site_footer">
      <div className="footer_tagline_container">
        <h1 className="script_tagline">Original designs, Made in Tunisia</h1>
        <p className="tagline_text">
          Née en Tunisie, Silky rend le haut de gamme accessible à tous.
        </p>
        <p className="tagline_text">
          Profitez de vêtements durables et élégants au meilleur prix et avec un service toujours à votre écoute.
        </p>
      </div>

      <hr className="footer_divider" />

      <div className="footer_main_container">
        <div className="footer_brand_col">
          <Link
            to="/"
            className="footer_logo_link"
            title="Retour au haut de page"
            onClick={() => handleNavClick('/')}
          >
            <img src="/pictures/logo.png" alt="Silky Logo" className="footer_logo_img" />
          </Link>

          <div className="social_links_wrapper">
            <div className="social_icons">
              <a href="https://www.instagram.com/silky.tn/" className="social_icon_link">
                <img src="/pictures/instagram.png" alt="Instagram" />
              </a>
              <a href="https://www.tiktok.com/@silky4042" className="social_icon_link">
                <img src="/pictures/tiktok.png" alt="TikTok" />
              </a>
              <a href="https://www.facebook.com/profile.php?id=61560630851600" className="social_icon_link">
                <img src="/pictures/facebook.png" alt="Facebook" />
              </a>
              <a href="mailto:silky26tn@gmail.com" className="social_icon_link">
                <img src="/pictures/gmail.png" alt="Email" />
              </a>
            </div>
            <span className="follow_us_text">Suivez-nous</span>
          </div>
        </div>

        <div className="footer_nav_cols">
          <div className="footer_col">
            <h4>SILKY</h4>
            <ul>
              <li><Link to="/" onClick={() => handleNavClick('/')}>Home</Link></li>
              <li><Link to="/collection/femme" onClick={() => handleNavClick('/collection/femme')}>Femme</Link></li>
              <li><Link to="/collection/enfant" onClick={() => handleNavClick('/collection/enfant')}>Enfant</Link></li>
            </ul>
          </div>

          <div className="footer_col">
            <h4>About</h4>
            <ul>
              <li><Link to="/about" onClick={() => handleNavClick('/about')}>à propos de nous</Link></li>
            </ul>
          </div>

          <div className="footer_col">
            <h4>Aide</h4>
            <ul>
              <li><Link to="/service-client" onClick={() => handleNavClick('/service-client')}>Service client</Link></li>
              <li><Link to="/contact" onClick={() => handleNavClick('/contact')}>Nous contacter</Link></li>
              <li><Link to="/livraison-retours#livraison" onClick={() => handleNavClick('/livraison-retours#livraison')}>Informations de livraison</Link></li>
              <li><Link to="/livraison-retours#retours" onClick={() => handleNavClick('/livraison-retours#retours')}>Politique de retours</Link></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="footer_copyright">
        <p>
          &copy; 2026 Silky
          {' · by '}
          <a
            href="https://github.com/HamedSallloua"
            target="_blank"
            rel="noopener noreferrer"
            className="footer_author_link"
          >
            Hamed
          </a>
        </p>
      </div>
    </footer>
  );
}
