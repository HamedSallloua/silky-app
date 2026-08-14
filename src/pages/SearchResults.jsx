import { useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { useProducts } from '../context/ProductsContext';
import '../styles/home.css';

export default function SearchResults() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const { visibleProducts, loading } = useProducts();

  const trimmed = query.trim().toLowerCase();
  const results = trimmed
    ? visibleProducts.filter(
        (p) =>
          p.name?.toLowerCase().includes(trimmed) ||
          p.category?.toLowerCase().includes(trimmed) ||
          p.description?.toLowerCase().includes(trimmed),
      )
    : [];

  return (
    <main className="search-results-page">
      <section className="collection-hero">
        <h1>Résultats de recherche</h1>
        {trimmed && (
          <p>
            {results.length} résultat{results.length !== 1 ? 's' : ''} pour «&nbsp;
            <em>{query}</em>&nbsp;»
          </p>
        )}
      </section>

      <div className="collections_wrapper">
        <section className="collection_section">
          {loading ? (
            <p style={{ textAlign: 'center' }}>Chargement…</p>
          ) : !trimmed ? (
            <p style={{ textAlign: 'center' }}>Saisissez un terme dans la barre de recherche.</p>
          ) : results.length === 0 ? (
            <p style={{ textAlign: 'center' }}>
              Aucun produit ne correspond à «&nbsp;<strong>{query}</strong>&nbsp;».
            </p>
          ) : (
            <div className="products_grid">
              {results.map((product) => (
                <ProductCard
                  key={product.id}
                  name={product.name}
                  product={product}
                  image={product.collectionImage || product.mainImage || '/pictures/femme_example.jpg'}
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
