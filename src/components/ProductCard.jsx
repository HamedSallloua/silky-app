import { Link } from 'react-router-dom';
import ProductPrice from './ProductPrice';

export default function ProductCard({ name, product, image, linkTo = '/product/1' }) {
  return (
    <div className="product_card">
      <Link to={linkTo} className="product_card_link">
        <div className="product_image_container">
          <img src={image} alt={name} className="product_img" />
        </div>
        <div className="product_info">
          <h3 className="product_name">{name}</h3>
          <p className="product_price">
            <ProductPrice product={product} size="small" />
          </p>
        </div>
      </Link>
    </div>
  );
}
