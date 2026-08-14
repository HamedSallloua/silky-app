import '../styles/contact.css';

export default function Contact() {
  const handleSubmit = (e) => {
    e.preventDefault();
  };

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

          <form className="contact-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="prenom">Prénom</label>
                <input type="text" id="prenom" name="prenom" required />
              </div>
              <div className="form-group">
                <label htmlFor="nom">Nom</label>
                <input type="text" id="nom" name="nom" required />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="email">Adresse e-mail</label>
              <input type="email" id="email" name="email" required />
            </div>

            <div className="form-group">
              <label htmlFor="message">Votre message</label>
              <textarea id="message" name="message" rows={6} required />
            </div>

            <div className="form-actions">
              <button type="submit" className="submit-btn">
                Envoyer
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
