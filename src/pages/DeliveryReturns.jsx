import '../styles/about.css';

export default function DeliveryReturns() {
  return (
    <main>
      <section className="about_section">
        <h2 className="about_heading" id="livraison">
          Informations de livraison
        </h2>
        <p>
          Livraison à domicile rapide en 24 à 48 heures. Paiement à la livraison, en espèces, directement auprès du
          livreur lors de la réception de votre colis.
        </p>

        <h2 className="about_heading" id="retours">
          Politique de retours
        </h2>
        <p>
          Vous pouvez ouvrir et inspecter votre colis devant le livreur avant de l&apos;accepter. Un échange est
          également possible (taille et couleur) dans un délai de 48 heures.
        </p>
      </section>
    </main>
  );
}
