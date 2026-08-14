import { useParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { useProducts } from '../context/ProductsContext';
import '../styles/home.css';

const COLLECTION_META = {
  femme: {
    title: 'Collection Femme',
    heroText: 'Découvrez toute notre collection femme',
    fallbackImage: '/pictures/femme_example.jpg',
  },
  enfant: {
    title: 'Collection Enfant',
    heroText: 'Découvrez toute notre collection enfant',
    fallbackImage: '/pictures/enfant_example.jpg',
  },
};

export default function Collection() {
  const { category } = useParams();
  const { getByCategory, loading } = useProducts();

  const meta = COLLECTION_META[category] ?? {
    title: 'Collection',
    heroText: 'Découvrez nos produits',
    fallbackImage: '/pictures/femme_example.jpg',
  };

  const products = getByCategory(category);

  return (
    <main>
      <section className="collection-hero">
        <h1>{meta.title}</h1>
        <p>{meta.heroText}</p>
      </section>

      <div className="collections_wrapper">
        <section className="collection_section">
          {loading ? (
            <p style={{ textAlign: 'center' }}>Chargement...</p>
          ) : products.length === 0 ? (
            <p style={{ textAlign: 'center' }}>Aucun produit disponible dans cette collection.</p>
          ) : (
            <div className="products_grid">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  name={product.name}
                  product={product}
                  image={product.collectionImage || product.mainImage || meta.fallbackImage}
                  linkTo={`/product/${product.id}`}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
