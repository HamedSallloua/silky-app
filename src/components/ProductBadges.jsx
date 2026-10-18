import { useAuth } from '../context/AuthContext';
import { hasDiscount } from '../utils/price';
import { isProductOutOfStock } from '../utils/stock';

export default function ProductBadges({ product, className = '' }) {
  const { isAdmin } = useAuth();
  const productObj = product?.product || product;
  const isHidden = Boolean(productObj?.isHidden);
  const isDiscounted = hasDiscount(productObj);
  const isOutOfStock = isProductOutOfStock(productObj);

  if (!isDiscounted && !isOutOfStock && !(isAdmin && isHidden)) return null;

  return (
    <div className={`product_badges ${className}`.trim()}>
      {isAdmin && isHidden && (
        <span className="product_badge product_badge_hidden">
          ● Masqué du site
        </span>
      )}
      {isDiscounted && (
        <span className="product_badge product_badge_promo">
          Promo!
        </span>
      )}
      {isOutOfStock && (
        <span className="product_badge product_badge_out_of_stock">
          Épuisé
        </span>
      )}
    </div>
  );
}
