/**
 * Silky dev seed script
 *
 * Usage:
 *   npm run db:seed
 *
 * Requires schema.sql to be applied first:
 *   npm run db:schema
 */

import pg from 'pg';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { env } from '../config/env.js';

const { Pool } = pg;

const DATABASE_URL = env.databaseUrl;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@silky.tn';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'silky-admin';

const SIZES_WOMEN = ['36', '38', '40', '42', '44', '46'];
const SIZES_KIDS = ['4', '6', '8', '10', '12'];

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function makeSku(productSlug, colorSlug, size) {
  return `${productSlug}-${colorSlug}-${size}`.toUpperCase();
}

function buildVariants(productSlug, colors, sizes, stockMatrix) {
  const variants = [];
  colors.forEach((color, ci) => {
    sizes.forEach((size, si) => {
      const stock = stockMatrix[ci * sizes.length + si] ?? 5;
      variants.push({
        size,
        color_slug: color.id,
        color_name: color.name,
        color_image_url: color.image,
        stock_quantity: stock,
        sku: makeSku(productSlug, color.id, size),
      });
    });
  });
  return variants;
}

const CATALOG = [
  {
    title: 'Set Comfy',
    description: 'Comfy set — tissu doux et confortable pour un look trendy au quotidien.',
    price: 45,
    discount_amount: 3,
    category_slug: 'femme',
    collection_image_url: '/pictures/comfybleu.jpg',
    main_image: '/pictures/comfybleu.jpg',
    thumbnails: [
      '/pictures/comfybleu.jpg',
      '/pictures/comfyrose.jpg',
      '/pictures/comfyjaune.jpg',
      '/pictures/comfybeige.jpg',
    ],
    colors: [
      { id: 'bleu', name: 'Bleu', image: '/pictures/comfybleu.jpg' },
      { id: 'rose', name: 'Rose', image: '/pictures/comfyrose.jpg' },
      { id: 'jaune', name: 'Jaune', image: '/pictures/comfyjaune.jpg' },
      { id: 'beige', name: 'Beige', image: '/pictures/comfybeige.jpg' },
    ],
    sizes: SIZES_WOMEN,
    stock: Array(24).fill(6),
    is_featured: true,
  },
  {
    title: 'Set Blush',
    description:
      'Ensemble élégant en tissu doux et confortable. Parfait pour un look trendy et classique au quotidien.',
    price: 53,
    discount_amount: 5,
    category_slug: 'femme',
    collection_image_url: '/pictures/blushmarron.jpg',
    main_image: '/pictures/blushmarron.jpg',
    thumbnails: [
      '/pictures/blushmarron.jpg',
      '/pictures/blushrose.jpg',
      '/pictures/blushblanccasse.jpg',
    ],
    colors: [
      { id: 'marron', name: 'Marron', image: '/pictures/blushmarron.jpg' },
      { id: 'rose', name: 'Rose', image: '/pictures/blushrose.jpg' },
      { id: 'blanc-casse', name: 'Blanc cassé', image: '/pictures/blushblanccasse.jpg' },
    ],
    sizes: SIZES_WOMEN,
    stock: [8, 6, 10, 5, 4, 3, 7, 5, 8, 6, 4, 2, 6, 4, 7, 5, 3, 2],
    is_featured: true,
  },
  {
    title: 'Robe Élégante',
    description: 'Robe fluide idéale pour toutes les occasions. Coupe moderne et finitions soignées.',
    price: 59,
    discount_amount: 0,
    category_slug: 'femme',
    collection_image_url: '/pictures/femme_example.jpg',
    main_image: '/pictures/femme_example.jpg',
    thumbnails: ['/pictures/femme_example.jpg', '/pictures/fexemple.jpg'],
    colors: [
      { id: 'noir', name: 'Noir', image: '/pictures/femme_example.jpg' },
      { id: 'bordeaux', name: 'Bordeaux', image: '/pictures/fexemple.jpg' },
    ],
    sizes: ['38', '40', '42', '44'],
    stock: [5, 8, 6, 4, 7, 5, 3, 2],
    is_featured: false,
  },
  {
    title: 'Ensemble Enfant',
    description: 'Tenue confortable pour enfant, facile à porter et à entretenir.',
    price: 35,
    discount_amount: 0,
    category_slug: 'enfant',
    collection_image_url: '/pictures/enfantbeige.jpg',
    main_image: '/pictures/enfantbeige.jpg',
    thumbnails: [
      '/pictures/enfantbeige.jpg',
      '/pictures/enfantbleu.jpg',
      '/pictures/enfantvert.jpg',
    ],
    colors: [
      { id: 'beige', name: 'Beige', image: '/pictures/enfantbeige.jpg' },
      { id: 'bleu', name: 'Bleu', image: '/pictures/enfantbleu.jpg' },
      { id: 'vert', name: 'Vert', image: '/pictures/enfantvert.jpg' },
    ],
    sizes: SIZES_KIDS,
    stock: [10, 8, 6, 5, 4, 9, 7, 6, 5, 3, 8, 6, 5, 4, 3],
    is_featured: true,
  },
  {
    title: 'Pyjama Doux',
    description: 'Pyjama en coton doux pour un confort optimal la nuit.',
    price: 29,
    discount_amount: 0,
    category_slug: 'enfant',
    collection_image_url: '/pictures/enfant_example.jpg',
    main_image: '/pictures/enfant_example.jpg',
    thumbnails: ['/pictures/enfant_example.jpg'],
    colors: [{ id: 'standard', name: 'Standard', image: '/pictures/enfant_example.jpg' }],
    sizes: ['6', '8', '10'],
    stock: [12, 10, 8],
    is_featured: false,
  },
];

async function wipeDevData(client) {
  await client.query(`
    TRUNCATE TABLE
      order_items,
      orders,
      cart_items,
      carts,
      favourites,
      reviews,
      store_reviews,
      review_gallery,
      product_images,
      product_variants,
      products,
      password_resets,
      users,
      categories,
      site_settings
    RESTART IDENTITY CASCADE
  `);
}

async function seedCategories(client) {
  const { rows } = await client.query(
    `
    INSERT INTO categories (name, slug) VALUES
      ('Women', 'femme'),
      ('Kids', 'enfant')
    RETURNING id, slug
    `,
  );
  return Object.fromEntries(rows.map((r) => [r.slug, r.id]));
}

async function seedUsers(client) {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const admin = await client.query(
    `
    INSERT INTO users (email, password_hash, role, full_name, phone_number)
    VALUES ($1, $2, 'admin', 'Silky Admin', '20000000')
    RETURNING id
    `,
    [ADMIN_EMAIL, passwordHash],
  );

  const customerHash = await bcrypt.hash('customer123', 12);
  const customers = await client.query(
    `
    INSERT INTO users (email, password_hash, role, full_name, phone_number) VALUES
      ('hamed.salloua@gmail.com', $1, 'customer', 'Hamed Salloua', '96746971'),
      ('zeineb.salloua@gmail.com', $1, 'customer', 'Zeineb Salloua', '21659143'),
      ('saber.salloua@gmail.com', $1, 'customer', 'Saber Salloua', '97539279')
    RETURNING id, email
    `,
    [customerHash],
  );

  return {
    adminId: admin.rows[0].id,
    customers: Object.fromEntries(customers.rows.map((r) => [r.email, r.id])),
  };
}

async function seedProduct(client, item, categoryId) {
  const slug = slugify(item.title);

  const { rows: productRows } = await client.query(
    `
    INSERT INTO products (
      title, slug, description, price, discount_amount,
      category_id, collection_image_url, is_featured
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
    `,
    [
      item.title,
      slug,
      item.description,
      item.price,
      item.discount_amount,
      categoryId,
      item.collection_image_url,
      item.is_featured,
    ],
  );
  const productId = productRows[0].id;

  await client.query(
    `
    INSERT INTO product_images (product_id, image_url, is_primary, sort_order)
    VALUES ($1, $2, TRUE, 0)
    `,
    [productId, item.main_image],
  );

  for (let i = 0; i < item.thumbnails.length; i += 1) {
    const url = item.thumbnails[i];
    if (url === item.main_image) continue;
    await client.query(
      `
      INSERT INTO product_images (product_id, image_url, is_primary, sort_order)
      VALUES ($1, $2, FALSE, $3)
      `,
      [productId, url, i + 1],
    );
  }

  const variants = buildVariants(slug, item.colors, item.sizes, item.stock);
  const variantMap = new Map();

  for (const variant of variants) {
    const { rows } = await client.query(
      `
      INSERT INTO product_variants (
        product_id, size, color_slug, color_name, color_image_url,
        stock_quantity, sku
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, size, color_slug
      `,
      [
        productId,
        variant.size,
        variant.color_slug,
        variant.color_name,
        variant.color_image_url,
        variant.stock_quantity,
        variant.sku,
      ],
    );
    variantMap.set(`${variant.color_slug}-${variant.size}`, rows[0].id);
  }

  return { productId, slug, variantMap, effectivePrice: item.price - item.discount_amount };
}

async function seedReviews(client, catalogMeta, customerIds) {
  await client.query(
    `
    INSERT INTO reviews (product_id, user_id, rating, comment, is_approved) VALUES
      ($1, $2, 5, 'Qualité excellente, tissu très doux. Je recommande!', TRUE),
      ($1, $3, 4, 'Très joli set, taille conforme.', TRUE),
      ($4, $2, 5, 'Parfait pour mon fils, confortable et résistant.', TRUE)
    `,
    [
      catalogMeta['set-comfy'].productId,
      customerIds['hamed.salloua@gmail.com'],
      customerIds['zeineb.salloua@gmail.com'],
      catalogMeta['ensemble-enfant'].productId,
    ],
  );

  await client.query(
    `
    INSERT INTO store_reviews (author_name, email, body, rating, status) VALUES
      ('Hamed', 'hamed.salloua@gmail.com', 'behia mo7tarma', 4, 'approved'),
      ('Zeineb', 'hamed.saloua68@gmail.com', 'me3ejbetnich', 1, 'rejected'),
      ('Saber', 'saber.salloua@gmail.com', 'Livraison rapide et service au top.', 5, 'approved')
    `,
  );
}

async function seedOrders(client, catalogMeta, customerIds) {
  const deliveryFee = 8;
  const address = '1 - rue Jaafar Ibn Abi Taleb - 8062 - Nabeul';

  const blush = catalogMeta['set-blush'];
  const comfy = catalogMeta['set-comfy'];
  const enfant = catalogMeta['ensemble-enfant'];

  const blushVariantId = blush.variantMap.get('rose-36');
  const comfyVariantId = comfy.variantMap.get('bleu-40');
  const enfantVariantId = enfant.variantMap.get('beige-8');

  const orders = [
    {
      order_number: 'SLK-58637198',
      user_id: customerIds['hamed.salloua@gmail.com'],
      customer_name: 'Hamed Salloua',
      customer_email: 'hamed.salloua@gmail.com',
      customer_phone: '96746971',
      subtotal: blush.effectivePrice,
      total: blush.effectivePrice + deliveryFee,
      status: 'processing',
      items: [
        {
          variant_id: blushVariantId,
          product_title: 'Set Blush',
          variant_label: 'Rose · Taille 36',
          image_url: '/pictures/blushrose.jpg',
          quantity: 1,
          unit_price: blush.effectivePrice,
        },
      ],
    },
    {
      order_number: 'SLK-60513921',
      user_id: customerIds['zeineb.salloua@gmail.com'],
      customer_name: 'Zeineb Salloua',
      customer_email: 'zeineb.salloua@gmail.com',
      customer_phone: '21659143',
      subtotal: enfant.effectivePrice,
      total: enfant.effectivePrice + deliveryFee,
      status: 'completed',
      items: [
        {
          variant_id: enfantVariantId,
          product_title: 'Ensemble Enfant',
          variant_label: 'Beige · Taille 8',
          image_url: '/pictures/enfantbeige.jpg',
          quantity: 1,
          unit_price: enfant.effectivePrice,
        },
      ],
    },
    {
      order_number: 'SLK-61542704',
      user_id: customerIds['saber.salloua@gmail.com'],
      customer_name: 'Saber Salloua',
      customer_email: 'saber.salloua@gmail.com',
      customer_phone: '97539279',
      subtotal: comfy.effectivePrice * 2,
      total: comfy.effectivePrice * 2 + deliveryFee,
      status: 'pending',
      items: [
        {
          variant_id: comfyVariantId,
          product_title: 'Set Comfy',
          variant_label: 'Bleu · Taille 40',
          image_url: '/pictures/comfybleu.jpg',
          quantity: 2,
          unit_price: comfy.effectivePrice,
        },
      ],
    },
    {
      order_number: 'SLK-70000001',
      user_id: null,
      guest_session_id: crypto.randomUUID(),
      customer_name: 'Guest Checkout',
      customer_email: 'guest@example.com',
      customer_phone: '90000000',
      subtotal: blush.effectivePrice,
      total: blush.effectivePrice + deliveryFee,
      status: 'cancelled',
      items: [
        {
          variant_id: blushVariantId,
          product_title: 'Set Blush',
          variant_label: 'Rose · Taille 36',
          image_url: '/pictures/blushrose.jpg',
          quantity: 1,
          unit_price: blush.effectivePrice,
        },
      ],
    },
  ];

  for (const order of orders) {
    const { rows } = await client.query(
      `
      INSERT INTO orders (
        order_number, user_id, guest_session_id,
        customer_name, customer_email, customer_phone, shipping_address,
        subtotal, delivery_fee, total_amount, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
      `,
      [
        order.order_number,
        order.user_id,
        order.guest_session_id ?? null,
        order.customer_name,
        order.customer_email,
        order.customer_phone,
        address,
        order.subtotal,
        deliveryFee,
        order.total,
        order.status,
      ],
    );

    for (const item of order.items) {
      await client.query(
        `
        INSERT INTO order_items (
          order_id, variant_id, product_title, variant_label,
          image_url, quantity, unit_price
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          rows[0].id,
          item.variant_id,
          item.product_title,
          item.variant_label,
          item.image_url,
          item.quantity,
          item.unit_price,
        ],
      );

      await client.query(
        `
        UPDATE product_variants
        SET stock_quantity = GREATEST(0, stock_quantity - $1)
        WHERE id = $2
        `,
        [item.quantity, item.variant_id],
      );
    }
  }
}

async function seedSiteSettings(client) {
  await client.query(
    `
    INSERT INTO site_settings (
      primary_color, secondary_color, hero_left_image, hero_right_image, delivery_fee
    ) VALUES (
      '#8D191C',
      '#F3EBEC',
      '/pictures/femme_example.jpg',
      '/pictures/enfant_example.jpg',
      8.000
    )
    `,
  );
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log('Wiping dev data…');
    await wipeDevData(client);

    console.log('Seeding categories…');
    const categoryIds = await seedCategories(client);

    console.log('Seeding users…');
    const { adminId, customers } = await seedUsers(client);

    console.log('Seeding catalog…');
    const catalogMeta = {};
    for (const item of CATALOG) {
      const meta = await seedProduct(client, item, categoryIds[item.category_slug]);
      catalogMeta[meta.slug] = meta;
    }

    console.log('Seeding reviews…');
    await seedReviews(client, catalogMeta, customers);

    console.log('Seeding orders…');
    await seedOrders(client, catalogMeta, customers);

    console.log('Seeding site settings…');
    await seedSiteSettings(client);

    console.log('\nSeed complete.');
    console.log(`  Admin:    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    console.log(`  Customer: hamed.salloua@gmail.com / customer123`);
    console.log(`  Admin id: ${adminId}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
