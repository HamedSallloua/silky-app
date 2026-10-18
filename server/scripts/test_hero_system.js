import assert from 'node:assert';
import { pool } from '../db/pool.js';
import { runHeroConfigMigration } from '../db/migrations/add_hero_config.js';
import { themeRepository } from '../repositories/theme.repository.js';
import { productRepository } from '../repositories/product.repository.js';

async function runTests() {
  console.log('--- Starting Hero System Automated Tests ---');

  // 1. Run Migration
  console.log('1. Running Hero Config Migration...');
  await runHeroConfigMigration(pool);
  console.log('✓ Migration executed successfully.');

  // 2. Initial GetSettings Test
  console.log('2. Testing getSettings fallback...');
  const initialTheme = await themeRepository.getSettings();
  assert(initialTheme, 'Theme settings returned');
  assert(initialTheme.heroConfig, 'heroConfig exists in theme settings');
  assert(['option1', 'option2', 'option3'].includes(initialTheme.heroConfig.templateType), 'Valid templateType');
  assert(initialTheme.heroConfig.option1, 'option1 config exists');
  assert(initialTheme.heroConfig.option2, 'option2 config exists');
  assert(Array.isArray(initialTheme.heroConfig.option3.slides), 'option3 slides array exists');
  console.log('✓ Initial getSettings fallback passed.');

  // 3. Update Option 1 Test
  console.log('3. Testing Option 1 Persistence & Preserving Other Settings...');
  const option1Update = {
    ...initialTheme,
    heroConfig: {
      templateType: 'option1',
      option1: {
        mainText: 'Collections Exclusives 2026',
        smallText: 'Mode haut de gamme en Tunisie',
        leftImage: '/uploads/test-femme.jpg',
        rightImage: '/uploads/test-enfant.jpg',
        leftButton: { text: 'Découvrir Femme', destination: '/collection/femme', visible: true },
        rightButton: { text: 'Découvrir Enfant', destination: '/collection/enfant', visible: false },
      },
      option2: initialTheme.heroConfig.option2,
      option3: initialTheme.heroConfig.option3,
    },
  };
  const savedOpt1 = await themeRepository.updateSettings(option1Update);
  assert.strictEqual(savedOpt1.heroConfig.templateType, 'option1');
  assert.strictEqual(savedOpt1.heroConfig.option1.mainText, 'Collections Exclusives 2026');
  assert.strictEqual(savedOpt1.heroConfig.option1.leftButton.text, 'Découvrir Femme');
  assert.strictEqual(savedOpt1.heroConfig.option1.rightButton.visible, false);
  assert.strictEqual(savedOpt1.primary, initialTheme.primary, 'Primary color preserved');
  assert.strictEqual(savedOpt1.secondary, initialTheme.secondary, 'Secondary color preserved');
  assert.strictEqual(savedOpt1.announcementsHidden, initialTheme.announcementsHidden, 'Announcements status preserved');
  console.log('✓ Option 1 persistence and theme isolation verified.');

  // 4. Update Option 2 Test
  console.log('4. Testing Option 2 (Single Image & Position Switching)...');
  const option2Update = {
    ...savedOpt1,
    heroConfig: {
      ...savedOpt1.heroConfig,
      templateType: 'option2',
      option2: {
        mainText: 'Nouvelle Saison',
        smallText: 'Qualité et élégance garanties',
        image: '/uploads/test-single.jpg',
        textPosition: 'right',
        button: { text: 'Explorer', destination: '/search', visible: true },
      },
    },
  };
  const savedOpt2 = await themeRepository.updateSettings(option2Update);
  assert.strictEqual(savedOpt2.heroConfig.templateType, 'option2');
  assert.strictEqual(savedOpt2.heroConfig.option2.mainText, 'Nouvelle Saison');
  assert.strictEqual(savedOpt2.heroConfig.option2.textPosition, 'right');
  assert.strictEqual(savedOpt2.heroConfig.option2.button.destination, '/search');
  console.log('✓ Option 2 single image & position switching verified.');

  // 5. Update Option 3 Test (Carousel with 3 slides)
  console.log('5. Testing Option 3 (Carousel 2-5 Slides)...');
  const option3Update = {
    ...savedOpt2,
    heroConfig: {
      ...savedOpt2.heroConfig,
      templateType: 'option3',
      option3: {
        slides: [
          {
            id: 'slide-1',
            mainText: 'Slide 1 - Femme',
            smallText: 'Robes et ensembles',
            image: '/uploads/slide1.jpg',
            textPosition: 'left',
            button: { text: 'Femme', destination: '/collection/femme', visible: true },
          },
          {
            id: 'slide-2',
            mainText: 'Slide 2 - Enfant',
            smallText: 'Confort et douceur',
            image: '/uploads/slide2.jpg',
            textPosition: 'right',
            button: { text: 'Enfant', destination: '/collection/enfant', visible: true },
          },
          {
            id: 'slide-3',
            mainText: 'Slide 3 - Promotions',
            smallText: 'Offres exclusives',
            image: '/uploads/slide3.jpg',
            textPosition: 'left',
            button: { text: 'Découvrir', destination: '/', visible: true },
          },
        ],
      },
    },
  };
  const savedOpt3 = await themeRepository.updateSettings(option3Update);
  assert.strictEqual(savedOpt3.heroConfig.templateType, 'option3');
  assert.strictEqual(savedOpt3.heroConfig.option3.slides.length, 3);
  assert.strictEqual(savedOpt3.heroConfig.option3.slides[0].mainText, 'Slide 1 - Femme');
  assert.strictEqual(savedOpt3.heroConfig.option3.slides[1].textPosition, 'right');
  assert.strictEqual(savedOpt3.heroConfig.option3.slides[2].mainText, 'Slide 3 - Promotions');
  console.log('✓ Option 3 carousel verified.');

  // 6. Test Image Reference Safety Check
  console.log('6. Testing Image Reference Safety in heroConfig...');
  const isSlideImageReferenced = await productRepository.isImageReferencedElsewhere('/uploads/slide2.jpg');
  assert.strictEqual(isSlideImageReferenced, true, 'Image in heroConfig is protected from deletion');
  const isUnreferencedImage = await productRepository.isImageReferencedElsewhere('/uploads/unused-random-999.jpg');
  assert.strictEqual(isUnreferencedImage, false, 'Unreferenced image returns false');
  console.log('✓ Image reference safety check verified.');

  console.log('--- ALL HERO SYSTEM TESTS PASSED SUCCESSFULLY! ---');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
