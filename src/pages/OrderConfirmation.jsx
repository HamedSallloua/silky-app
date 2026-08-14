import { Link, useLocation } from 'react-router-dom';
import '../styles/checkout.css';

export default function OrderConfirmation() {
  const { state } = useLocation();
  const order = state?.order;

  if (!order) {
    return (
      <main className="checkout-page">
        <section className="checkout-section">
          <h1 className="checkout-title">Commande confirmée</h1>
          <p>Aucune commande récente trouvée.</p>
          <Link to="/" className="checkout-back-link">
            Retour à l&apos;accueil
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="checkout-page">
      <section className="checkout-section checkout-success">
        <h1 className="checkout-title">Merci pour votre commande!</h1>
        <p className="checkout-order-number">Numéro de commande: <strong>{order.orderNumber}</strong></p>
        <p>Nous avons bien reçu votre commande. Notre équipe vous contactera pour la livraison.</p>
        <Link to="/" className="checkout-back-link">
          Continuer mes achats
        </Link>
      </section>
    </main>
  );
}
