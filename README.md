# SWE Final Year Picnic

A lightweight web application for verifying eligible final-year Software Engineering students, collecting picnic payments via Quickteller, and monitoring payment records for admins.

## Features

- Student registration verification using a registration number
- Duplicate-payment prevention at the backend level
- Quickteller payment checkout redirection
- Countdown timer for payment deadline
- Secure webhook handling for payment confirmation
- Admin dashboard with statistics and filtering
- CSV export for payment records
- MongoDB Atlas-ready data model
- Responsive frontend for mobile and desktop

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js + Express.js
- Database: MongoDB + Mongoose
- Payments: Quickteller
- Deployment: Express static serving for frontend; Render or Node hosting for backend

## Project Structure

```text
swe-final-year-picnic/
├── client/
│   ├── index.html
│   ├── success.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── main.js
│       └── success.js
├── server/
│   ├── server.js
│   ├── config/
│   │   └── db.js
│   ├── models/
│   │   └── Student.js
│   ├── routes/
│   │   ├── studentRoutes.js
│   │   ├── paymentRoutes.js
│   │   └── adminRoutes.js
│   ├── controllers/
│   │   ├── studentController.js
│   │   ├── paymentController.js
│   │   └── adminController.js
│   ├── middleware/
│   │   └── auth.js
│   └── utils/
│       └── generateReference.js
├── data/
│   └── students.csv
├── scripts/
│   └── importStudents.js
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── .env
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```env
PORT=5000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/picnic
PAYMENT_PROVIDER=quickteller
QUICKTELLER_MERCHANT_ID=your_quickteller_merchant_id
QUICKTELLER_API_KEY=your_quickteller_api_key
QUICKTELLER_WEBHOOK_HASH=your_quickteller_webhook_hash
QUICKTELLER_CHECKOUT_URL=https://checkout.quickteller.com
PICNIC_FEE=5000
PAYMENT_DEADLINE=2026-09-20T23:59:59
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=supersecretpassword
FRONTEND_URL=http://localhost:5000
```

## MongoDB Setup

1. Create a MongoDB Atlas cluster.
2. Create a database user with read/write access.
3. Get the connection string and set it in `MONGODB_URI`.
4. Ensure your app can connect to the cluster.

## Quickteller Setup

1. Create or access your Quickteller/InterSwitch merchant account.
2. Get your merchant ID, API key, and webhook hash from the dashboard.
3. Keep the secret key in the backend only.
4. Configure your redirect URL to your frontend success route, e.g. `https://your-site.com/payment-success`.
5. Set `QUICKTELLER_CHECKOUT_URL` to the correct Quickteller checkout host for your region/account.
6. Copy the webhook hash to `QUICKTELLER_WEBHOOK_HASH`.

## Student CSV Import

Prepare a CSV file with headers:

```csv
name,registrationNumber
Ahmad Imam,21/12345
Musa Abdullahi,21/12346
```

Place the file in `data/students.csv` and run:

```bash
npm run import:students
```

The import script prevents duplicates by checking the registration number.

## Installation

```bash
npm install
cp .env.example .env
npm run dev
```

Or start production mode:

```bash
npm start
```

## API Endpoints

### Public

- `GET /api/health`
- `POST /api/students/verify`
- `POST /api/payments/initialize`
- `GET /api/payments/verify/:reference`
- `POST /api/payments/webhook`

### Admin

- `POST /api/admin/login`
- `GET /api/admin/stats`
- `GET /api/admin/students`
- `GET /api/admin/payments`

## Local Development

Run:

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:5000
```

## Deployment

### Frontend

- You can serve the static frontend via Express as implemented.
- Or deploy the `client` folder to Vercel.

### Backend

- Deploy the Node.js app to Render or another Node server host.
- Set environment variables in your hosting provider.

### Database

- Use MongoDB Atlas and configure `MONGODB_URI` in the deployment environment.

## Security Notes

- Never expose the Quickteller secret key to the frontend.
- Never trust client-side payment status or amount.
- Validate user input and use backend checks for duplicates and deadline enforcement.
- Verify webhook signatures before updating the database.
- Use admin authentication before accessing dashboard endpoints.

## License

This project is for academic demonstration and event management use.
