# POS Hub – Instructor Website

A lightweight **Point-of-Sale (POS) web application** built with **Node.js, Express and EJS**. It has a public storefront, a cashier sales terminal, an admin inventory desk, and a sales ledger. Cart changes and inventory updates sync live across open browser tabs using WebSockets.

> Data is stored in plain JSON files, so there is no database to install. This makes the project easy to run and a good learning project.

## Features

- **Public storefront** – browse products and special offers on the home page
- **Authentication** – register and log in with session-based auth (8-hour sessions)
- **Role-based access** – `admin` and `authorized_cashier` roles
- **Sales terminal** – add, remove and clear items in a per-user cart
- **Checkout** – collect customer name and address in a modal, then save the sale
- **Admin inventory desk** – create, update and delete products, with image upload (Multer)
- **Delete protection** – a product that already appears in the sales log cannot be deleted
- **Sales ledger** – admins can view all archived receipts, newest first
- **Real-time sync** – WebSocket broadcast refreshes all open tabs when data changes, plus a live chat channel between terminals

## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js |
| Server | Express 5 |
| Templating | EJS |
| Sessions | express-session |
| File uploads | Multer |
| Real-time | ws (WebSocket) |
| Storage | JSON files (`data/`) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- npm

### Installation

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
npm install
```

### Run

```bash
npm start        # production
npm run dev      # development with auto-reload (nodemon)
```

Open **http://localhost:8080** in your browser.

### First-time setup

1. Go to `/register` and create an account.
2. Registering with the username **`admin`** automatically creates an admin account.
3. Log in at `/login`. You will be redirected to the sales terminal.

## Routes

| Route | Access | Description |
| --- | --- | --- |
| `/` | Public | Storefront and offers |
| `/register`, `/login`, `/logout` | Public | Authentication |
| `/terminal` | Logged in | POS sales terminal and cart |
| `/cart/add`, `/cart/remove`, `/cart/remove-all`, `/cart/checkout` | Logged in | Cart actions |
| `/admin/inventory` | Admin | Manage products |
| `/product/create`, `/product/update`, `/product/delete` | Admin | Product actions |
| `/sales` | Admin | Sales ledger |

## Project Structure

```
.
├── app.js              # Express server, routes, WebSocket logic
├── data/               # JSON "database" (products, sales, users)
├── public/js/          # Static client-side scripts
├── uploads/            # Uploaded product images
├── views/              # EJS templates
│   └── partials/       # Shared header and footer
└── package.json
```

## Security Notes

This project is intended for learning and local use. Before deploying it publicly, you should:

- Hash passwords (for example with `bcrypt`) instead of storing plain text
- Move the session secret into an environment variable
- Remove the default admin credentials from `data/users.json`
- Add CSRF protection and validate file uploads (type and size)
- Enable `cookie.secure` when serving over HTTPS

## Future Improvements

- Move from JSON files to a real database (SQLite, MongoDB or PostgreSQL)
- Add stock quantity tracking
- Add printable PDF invoices
- Add sales reports and charts

## License

ISC
