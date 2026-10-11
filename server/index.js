require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth');
const subjectRoutes = require('./routes/subjects');
const examRoutes = require('./routes/exams');
const questionRoutes = require('./routes/questions');
const { router: attemptRoutes } = require('./routes/attempts');
const resultRoutes = require('./routes/results');
const reportRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');
const violationRoutes = require('./routes/violations');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security middleware ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // CSP handled by Cloudflare in production; disabling avoids onclick conflicts in tunnel
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: true, // reflect request origin — safe because auth is cookie-based, not CORS-based
  credentials: true,
}));

// Global rate limit
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

// Auth-specific stricter rate limit
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts, please try again in 15 minutes.' },
});

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// ─── Static files (serve frontend) ─────────────────────────────────────────────
const FRONTEND_DIR = path.join(__dirname, '..');
app.use(express.static(FRONTEND_DIR, {
  index: false, // we handle this manually so SPA works
  setHeaders: (res, filePath) => {
    // Don't cache JS/CSS for dev; adjust for production
    if (process.env.NODE_ENV !== 'production') {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// ─── API routes ────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/subjects', subjectRoutes);
app.use('/api/v1/exams', examRoutes);
app.use('/api/v1/questions', questionRoutes);
app.use('/api/v1/attempts', attemptRoutes);
app.use('/api/v1/results', resultRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/violations', violationRoutes);

// ─── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  // Only serve index.html for non-API routes
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  }
});

// ─── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(isDev && { stack: err.stack }),
  });
});

// ─── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 ScoreX server running at http://localhost:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   DB: ${process.env.DATABASE_URL}`);
  });
}

module.exports = app;
