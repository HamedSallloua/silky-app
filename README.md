# Silky — React App

Your HTML/CSS clothes shop converted to a React single-page application with routing.

## Prerequisites

Install [Node.js](https://nodejs.org/) (LTS recommended). This adds `npm` to your PATH.

## Setup

1. **Copy your images** into `public/pictures/` (logo, product photos, icons, etc.). The app expects the same paths as your HTML site, e.g. `/pictures/logo.png`.

2. **Install dependencies:**

```bash
cd silky-app
npm install
```

3. **Start the dev server:**

```bash
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

## Build for production

```bash
npm run build
npm run preview
```

## Project structure

```
silky-app/
├── public/pictures/     # Static images (copy your /pictures folder here)
├── src/
│   ├── components/
│   │   ├── layout/      # Header, Footer, AnnouncementBar, Layout
│   │   ├── ProductCard.jsx
│   │   ├── CollectionSection.jsx
│   │   └── ReviewsSection.jsx
│   ├── pages/           # One component per page
│   ├── styles/          # CSS split by page (from your original files)
│   ├── App.jsx          # Routes
│   └── main.jsx
```

## Routes

| Path | Page |
|------|------|
| `/` | Home |
| `/product/:id` | Product detail |
| `/cart` | Shopping cart |
| `/about` | About |
| `/contact` | Contact |
| `/login` | Login |
| `/signup` | Sign up |
| `/password-reset` | Password reset |

## What's next

- Wire up a backend or headless CMS for products, cart, and auth
- Replace placeholder product data with real API calls
- Add Femme / Enfant collection pages when ready

Your original HTML/CSS files in the parent folder are unchanged.
