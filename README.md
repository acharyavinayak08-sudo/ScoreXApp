# ScoreX — Full-Stack Online Examination System

A complete role-based online examination platform with secure exam mode, real-time violation tracking, server-side scoring, and progress reports.

## Features

- **Three roles**: Student, Faculty, Admin — each with a fully functional dashboard
- **Secure exam mode**: Fullscreen enforcement, tab/window switch detection, violation recording
- **Server-side scoring**: Answers and results stored in database — cannot be tampered via browser
- **Faculty exam builder**: Create exams, add MCQ questions, publish/unpublish
- **Progress tracking**: Weekly reports, subject breakdown, exam history
- **JWT authentication**: httpOnly cookies, role verified server-side on every request
- **Admin panel**: User management, audit logs, system statistics

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS SPA (no build step) |
| Backend | Node.js + Express.js |
| Database | SQLite (dev) / PostgreSQL (prod) via Prisma ORM |
| Auth | JWT in httpOnly cookies + bcrypt |
| Validation | express-validator |
| Tests | Jest + Supertest |

---

## Quick Start (Local Development)

### Prerequisites
- Node.js v18+ (tested with v26)
- npm v9+

### 1. Clone / Download

```bash
# Navigate to your project folder
cd ScoreX
```

### 2. One-command setup (install + migrate + seed)

```bash
npm run setup
```

This runs: `npm install` → `prisma generate` → `prisma migrate dev` → `node server/seed.js`

### 3. Start the development server

```bash
npm run dev
```

Open **http://localhost:3000**

---

## Manual Setup (Step by Step)

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run database migrations (creates SQLite file automatically)
npm run db:migrate

# Seed the database with sample data
npm run db:seed

# Start the server
npm run dev
```

---

## Test Accounts (after seeding)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@scorex.local | Admin@1234 |
| Faculty | faculty1@scorex.local | Faculty@123 |
| Faculty | faculty2@scorex.local | Faculty@123 |
| Student | student1@scorex.local | Student@123 |
| Student | student2@scorex.local | Student@123 |
| Student | student3@scorex.local | Student@123 |

> **Note**: Admin accounts cannot be created via public registration. They must be provisioned via seed or directly in the database.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection string | `file:./dev.db` (SQLite) |
| `JWT_SECRET` | Secret for signing JWTs | Change in production! |
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `COOKIE_SECURE` | Set to `true` for HTTPS | `false` |
| `ALLOWED_ORIGIN` | CORS origin | `http://localhost:3000` |
| `ADMIN_EMAIL` | Seed admin email | `admin@scorex.local` |
| `ADMIN_PASSWORD` | Seed admin password | `Admin@1234` |

---

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start server with hot reload (Node --watch) |
| `npm start` | Start server (production) |
| `npm run setup` | Full one-command setup |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed sample data |
| `npm run db:studio` | Open Prisma Studio (DB browser) |
| `npm run db:reset` | Reset DB and re-seed |
| `npm test` | Run all tests |

---

## Project Structure

```
ScoreX/
├── index.html          # SPA shell
├── style.css           # Styles (ScoreX theme)
├── app.js              # Frontend SPA (all API calls)
├── server/
│   ├── index.js        # Express entry point
│   ├── seed.js         # Database seed script
│   ├── prisma/
│   │   ├── schema.prisma   # Database schema (10 models)
│   │   └── dev.db          # SQLite database (auto-created)
│   ├── middleware/
│   │   ├── auth.js     # JWT verify, role guards
│   │   └── validate.js # Input validation
│   └── routes/
│       ├── auth.js         # Register, login, logout, /me
│       ├── subjects.js     # Subject CRUD
│       ├── exams.js        # Exam CRUD + publish
│       ├── questions.js    # Question + option CRUD
│       ├── attempts.js     # Start, save answer, submit
│       ├── results.js      # Result + answer review
│       ├── reports.js      # Weekly + progress reports
│       ├── admin.js        # Admin: users, stats, audit
│       └── violations.js   # Security violation recording
├── tests/
│   ├── auth.test.js    # Auth & authorization tests
│   └── exam.test.js    # Exam flow tests
├── .env                # Local environment (gitignored)
├── .env.example        # Template
└── package.json
```

---

## API Reference

All endpoints are under `/api/v1/`.

### Authentication
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | Public | Register student/faculty |
| POST | `/auth/login` | Public | Login (sets httpOnly cookie) |
| POST | `/auth/logout` | Auth | Clear session |
| GET | `/auth/me` | Auth | Get current user |

### Exams
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/exams` | Auth | List exams (filtered by role) |
| POST | `/exams` | Faculty/Admin | Create exam |
| GET | `/exams/:id` | Auth | Get exam details |
| PUT | `/exams/:id` | Faculty/Admin (owner) | Update exam |
| DELETE | `/exams/:id` | Faculty/Admin (owner) | Delete exam |
| POST | `/exams/:id/publish` | Faculty/Admin (owner) | Toggle publish |
| GET | `/exams/:id/attempts` | Faculty/Admin (owner) | Student attempts |

### Questions
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/questions/exam/:examId` | Auth | Get questions (no correct for students) |
| POST | `/questions` | Faculty/Admin | Add question |
| PUT | `/questions/:id` | Faculty/Admin (owner) | Update question |
| DELETE | `/questions/:id` | Faculty/Admin (owner) | Delete question |

### Attempts
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/attempts` | Student | Start attempt |
| GET | `/attempts/:id` | Auth | Get attempt state |
| PUT | `/attempts/:id/answer` | Student | Save answer |
| POST | `/attempts/:id/submit` | Student | Submit exam |

### Results & Reports
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/results` | Auth | List results |
| GET | `/results/:attemptId` | Auth | Detailed result + review |
| GET | `/reports/weekly` | Auth | Weekly progress |
| GET | `/reports/progress` | Auth | Full progress summary |

### Admin
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/stats` | Admin | System statistics |
| GET | `/admin/users` | Admin | List all users |
| PUT | `/admin/users/:id` | Admin | Update user (activate/deactivate) |
| DELETE | `/admin/users/:id` | Admin | Delete user |
| GET | `/admin/audit` | Admin | Audit logs |
| GET | `/admin/violations` | Admin | Security violations |

### Violations
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/violations` | Student | Record security violation |

---

## Switching to PostgreSQL (Production)

1. Set up a PostgreSQL database
2. Update `.env`:
   ```
   DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/scorex?schema=public"
   ```
3. Update `server/prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
4. Run migrations:
   ```bash
   npx prisma migrate deploy
   node server/seed.js
   ```

---

## Deploying to Production

### Railway / Render / Fly.io

1. Push your code to GitHub (do NOT push `.env` or `dev.db`)
2. Create a new project on your hosting platform
3. Add a PostgreSQL database (these platforms offer free tiers)
4. Set environment variables:
   - `DATABASE_URL` — your PostgreSQL connection string
   - `JWT_SECRET` — a long random string (use `openssl rand -hex 32`)
   - `NODE_ENV=production`
   - `COOKIE_SECURE=true`
   - `PORT=3000`
5. Set build command: `npm install && npx prisma generate && npx prisma migrate deploy`
6. Set start command: `npm start`
7. Run seed after first deploy: `node server/seed.js` (one-time)

### Security Checklist for Production
- [ ] Strong `JWT_SECRET` (32+ random bytes)
- [ ] `COOKIE_SECURE=true` (requires HTTPS)
- [ ] `NODE_ENV=production`
- [ ] Change default admin password after first login
- [ ] Set `ALLOWED_ORIGIN` to your actual domain
- [ ] Enable HTTPS on your hosting platform

---

## Running Tests

```bash
npm test
```

Tests use the same SQLite database but clean up after themselves.

**What's tested:**
- ✅ Registration validation (password rules, duplicate email)
- ✅ Admin cannot be registered publicly
- ✅ Login with correct/wrong credentials
- ✅ Session via httpOnly cookie
- ✅ Student/faculty blocked from admin endpoints
- ✅ Deactivated accounts blocked
- ✅ Faculty exam creation and publication
- ✅ Faculty cannot modify another faculty's exam
- ✅ Student starts exam — correct answers NOT in response
- ✅ Answer save, exam submission, score calculation
- ✅ Double submission rejected
- ✅ Result + answer review after submission
- ✅ Data isolation between students

---

## Security Notes

Browser-based proctoring (fullscreen, tab detection, keyboard restrictions) provides a deterrent layer but cannot prevent all cheating. The platform enforces:

- **Server-side scoring** — the score is computed from database records, not client-reported values
- **Server-side timing** — the attempt `startedAt` is stored; answers submitted after time expiry are rejected
- **Server-side violations** — violation count is stored in the database and can trigger auto-submit
- **Role verification** — every API request verifies the user's role from the database, never from client claims
- **No answer leakage** — correct answers are never sent to the student client before submission
