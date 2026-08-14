const SIZES = ['36', '38', '40', '42', '44', '46'];

function makeStock(colorIds, sizes, quantities) {
  const stock = {};
  colorIds.forEach((colorId, ci) => {
    sizes.forEach((size, si) => {
      stock[`${colorId}-${size}`] = quantities[ci * sizes.length + si] ?? 5;
    });
  });
  return stock;
}

export const DEFAULT_PRODUCTS = [
  {
    id: '1',
    name: 'Set Blush',
    description:
      'Ensemble élégant en tissu doux et confortable. Parfait pour un look trendy et classique au quotidien.',
    price: 45.0,
    category: 'femme',
    mainImage: '/pictures/fexemple.jpg',
    thumbnails: [
      '/pictures/fexemple.jpg',
      '/pictures/femme_example.jpg',
      '/pictures/fexemple.jpg',
      '/pictures/femme_example.jpg',
      '/pictures/fexemple.jpg',
    ],
    colors: [
      { id: 'rose', name: 'Rose', image: '/pictures/fexemple.jpg', images: ['/pictures/fexemple.jpg', '/pictures/femme_example.jpg'] },
      { id: 'beige', name: 'Beige', image: '/pictures/femme_example.jpg', images: ['/pictures/femme_example.jpg', '/pictures/fexemple.jpg'] },
      { id: 'blanc', name: 'Blanc', image: '/pictures/fexemple.jpg', images: ['/pictures/fexemple.jpg'] },
    ],
    sizes: SIZES,
    stock: makeStock(['rose', 'beige', 'blanc'], SIZES, [
      8, 6, 10, 5, 4, 3, 7, 5, 8, 6, 4, 2, 6, 4, 7, 5, 3, 2,
    ]),
    collectionImage: '/pictures/femme_example.jpg',
  },
  {
    id: '2',
    name: 'Robe Élégante',
    description: 'Robe fluide idéale pour toutes les occasions. Coupe moderne et finitions soignées.',
    price: 59.0,
    category: 'femme',
    mainImage: '/pictures/femme_example.jpg',
    thumbnails: [
      '/pictures/femme_example.jpg',
      '/pictures/fexemple.jpg',
      '/pictures/femme_example.jpg',
    ],
    colors: [
      { id: 'noir', name: 'Noir', image: '/pictures/femme_example.jpg', images: ['/pictures/femme_example.jpg', '/pictures/fexemple.jpg'] },
      { id: 'bordeaux', name: 'Bordeaux', image: '/pictures/fexemple.jpg', images: ['/pictures/fexemple.jpg'] },
    ],
    sizes: ['38', '40', '42', '44'],
    stock: makeStock(['noir', 'bordeaux'], ['38', '40', '42', '44'], [5, 8, 6, 4, 7, 5, 3, 2]),
    collectionImage: '/pictures/femme_example.jpg',
  },
  {
    id: '3',
    name: 'Ensemble Enfant',
    description: 'Tenue confortable pour enfant, facile à porter et à entretenir.',
    price: 35.0,
    category: 'enfant',
    mainImage: '/pictures/enfant_example.jpg',
    thumbnails: ['/pictures/enfant_example.jpg', '/pictures/fexemple.jpg'],
    colors: [
      { id: 'bleu', name: 'Bleu', image: '/pictures/enfant_example.jpg', images: ['/pictures/enfant_example.jpg', '/pictures/fexemple.jpg'] },
      { id: 'rose-enf', name: 'Rose', image: '/pictures/fexemple.jpg', images: ['/pictures/fexemple.jpg'] },
    ],
    sizes: ['4', '6', '8', '10', '12'],
    stock: makeStock(['bleu', 'rose-enf'], ['4', '6', '8', '10', '12'], [
      10, 8, 6, 5, 4, 9, 7, 6, 5, 3,
    ]),
    collectionImage: '/pictures/enfant_example.jpg',
  },
  {
    id: '4',
    name: 'Pyjama Doux',
    description: 'Pyjama en coton doux pour un confort optimal la nuit.',
    price: 29.0,
    category: 'enfant',
    mainImage: '/pictures/enfant_example.jpg',
    thumbnails: ['/pictures/enfant_example.jpg'],
    colors: [{ id: 'default-color', name: 'Standard', image: '/pictures/enfant_example.jpg', images: ['/pictures/enfant_example.jpg'] }],
    sizes: ['6', '8', '10'],
    stock: makeStock(['default-color'], ['6', '8', '10'], [12, 10, 8]),
    collectionImage: '/pictures/enfant_example.jpg',
  },
];
