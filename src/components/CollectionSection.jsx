import { Link } from 'react-router-dom';
import ProductCard from './ProductCard';

export default function CollectionSection({ title, image, products, viewAllHref = '#' }) {
  return (
    <section className="collection_section">
      <h2 className="collection_title">{title}</h2>

      <div className="products_grid">
        {products.map((product, index) => (
          <ProductCard
            key={product.linkTo || `${product.name}-${index}`}
            name={product.name}
            product={product.product || product}
            image={product.image || image}
            linkTo={product.linkTo || `/product/${index + 1}`}
          />
        ))}
      </div>

      <div className="button_container">
        <Link to={viewAllHref} className="tout_button">
          TOUT
        </Link>
      </div>
    </section>
  );
}
