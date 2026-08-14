const PHRASES = [
  'Livraison sur toute la Tunisie!',
  'Livraison rapide en 24/48 heures',
  'Qualité garantie',
  'Promotions speciales et Offres exclusives!',
  'Service client disponible 24/7',
];

function Flag() {
  return <img src="/pictures/tnflag.jpg" alt="" className="flag_img" aria-hidden="true" />;
}

function AnnouncementTrack({ phrases }) {
  const items = [];
  phrases.forEach((phrase, i) => {
    items.push(<Flag key={`flag-before-${i}`} />);
    items.push(
      <span key={`phrase-${i}`} className="announcement_text">
        {phrase}
      </span>,
    );
  });
  items.push(<Flag key="flag-end" />);
  return items;
}

export default function AnnouncementBar() {
  return (
    <div id="top" className="announcement_bar" aria-label="Annonces">
      <div className="announcement_marquee">
        <div className="announcement_marquee_track">
          <div className="announcement_sequence">
            <AnnouncementTrack phrases={PHRASES} />
          </div>
          <div className="announcement_sequence" aria-hidden="true">
            <AnnouncementTrack phrases={PHRASES} />
          </div>
        </div>
      </div>
    </div>
  );
}
