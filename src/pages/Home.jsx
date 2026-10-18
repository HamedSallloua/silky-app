import CollectionSection from '../components/CollectionSection';
import ProductCarousel from '../components/ProductCarousel';
import ReviewsSection from '../components/ReviewsSection';
import HeroRenderer from '../components/hero/HeroRenderer';
import { useProducts } from '../context/ProductsContext';
import { useTheme } from '../context/ThemeContext';
import '../styles/home.css';

export default function Home() {
  const { getByCategory, visibleProducts, loading } = useProducts();
  const { theme } = useTheme();

  const femmeProducts = getByCategory('femme').slice(0, 4).map((p) => ({
    name: p.name,
    product: p,
    image: p.collectionImage || p.mainImage,
    linkTo: `/product/${p.id}`,
  }));

  const enfantProducts = getByCategory('enfant').slice(0, 4).map((p) => ({
    name: p.name,
    product: p,
    image: p.collectionImage || p.mainImage,
    linkTo: `/product/${p.id}`,
  }));

  const femmeHeroImage =
    getByCategory('femme')[0]?.collectionImage ||
    getByCategory('femme')[0]?.mainImage ||
    '/pictures/femme_example.jpg';

  const enfantHeroImage =
    getByCategory('enfant')[0]?.collectionImage ||
    getByCategory('enfant')[0]?.mainImage ||
    '/pictures/enfant_example.jpg';

  return (
    <>
      <HeroRenderer heroConfig={theme?.heroConfig} />

      {!loading && visibleProducts.length > 0 && <ProductCarousel products={visibleProducts} />}

      <div className="collections_wrapper">
        {!loading && femmeProducts.length > 0 && (
          <CollectionSection
            title="Collection Femme"
            image={femmeHeroImage}
            products={femmeProducts}
            viewAllHref="/collection/femme"
          />
        )}

        {!loading && enfantProducts.length > 0 && (
          <CollectionSection
            title="Collection Enfant"
            image={enfantHeroImage}
            products={enfantProducts}
            viewAllHref="/collection/enfant"
          />
        )}
      </div>

      <ReviewsSection />
    </>
  );
}
