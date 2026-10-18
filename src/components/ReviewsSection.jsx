import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import InfiniteMarquee from './InfiniteMarquee';
import { calculateRatingSummary } from '../utils/ratings';
import '../styles/reviews.css';

export default function ReviewsSection({ ratingText, layout = 'default' }) {
  const [gallery, setGallery] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [ratingSummary, setRatingSummary] = useState(null);

  useEffect(() => {
    api
      .getPublishedReviews()
      .then(({ reviews: published, gallery: galleryItems, summary }) => {
        setGallery(galleryItems || []);
        setReviews(published || []);
        if (published?.length) {
          setRatingSummary(summary || calculateRatingSummary(published));
        } else {
          setRatingSummary(null);
        }
      })
      .catch(() => {
        setGallery([]);
        setReviews([]);
        setRatingSummary(null);
      });
  }, []);

  const renderRatingSummary = () => {
    if (ratingText) return ratingText;
    if (!ratingSummary || ratingSummary.count === 0) {
      return (
        <>
          Aucun avis publié pour le moment
          <br />
          Soyez le premier à donner votre avis
        </>
      );
    }
    const { average, label, count } = ratingSummary;
    return (
      <>
        <strong>{average}/5 {label}</strong>
        <br />
        {count} avis
      </>
    );
  };

  const galleryItemsToRender = gallery.slice(0, 10);
  const reviewsToRender = reviews.slice(0, 15);

  return (
    <section className={`reviews_section${layout === 'leave-review' ? ' reviews_section_leave_page' : ''}`}>
      {layout === 'leave-review' ? (
        <div className="rating_summary rating_summary_centered">{renderRatingSummary()}</div>
      ) : (
        <div className="reviews_header">
          <div className="rating_summary">{renderRatingSummary()}</div>

          <div className="reviews_title_container">
            <h2 className="reviews_title">AVIS CLIENT</h2>
            <Link to="/leave-review" className="reviews_logo_link">
              <img src="/pictures/avis.png" alt="Avis clients Silky" className="reviews_main_img" />
            </Link>
          </div>

          <div className="leave_review_container">
            <Link to="/leave-review" className="leave_review_link">
              Donner votre avis et évaluez votre expérience Silky
            </Link>
          </div>
        </div>
      )}

      <div className="reviews_content_grid">
        {galleryItemsToRender.length > 0 && (
          <div className="horizontal_gallery_wrapper">
            <InfiniteMarquee className="gallery_marquee" orientation="horizontal" speed={30} stepAmount={255}>
              {galleryItemsToRender.map((image, index) => (
                <div key={image.id || image.src || index} className="gallery_image_item">
                  <img src={image.src} alt={image.alt || `Avis client ${index + 1}`} className="review_gallery_img" draggable={false} />
                </div>
              ))}
            </InfiniteMarquee>
          </div>
        )}

        {reviewsToRender.length > 0 && (
          <div className="vertical_reviews_wrapper">
            <InfiniteMarquee className="reviews_text_marquee" orientation="vertical" speed={30} stepAmount={120}>
              {reviewsToRender.map((review, index) => (
                <div key={review.id || index} className="review_text_card review_marquee_item">
                  <div className="review_account_name">{review.authorName || review.name}</div>
                  <div className="review_body">{review.body}</div>
                </div>
              ))}
            </InfiniteMarquee>
          </div>
        )}
      </div>
    </section>
  );
}



