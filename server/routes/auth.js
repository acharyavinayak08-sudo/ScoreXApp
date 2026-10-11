const express = require('express');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { signToken, setCookie, clearCookie, verifyToken, auditLog } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/v1/auth/register
router.post('/register',
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
    body('uid').trim().isLength({ min: 2, max: 50 }).withMessage('User ID must be 2-50 characters'),
    body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
      .matches(/[0-9]/).withMessage('Password must contain a number'),
    body('role').isIn(['student', 'faculty']).withMessage('Role must be student or faculty'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { name, uid, email, password, role } = req.body;

      // Check for existing user
      const existing = await prisma.user.findFirst({
        where: { OR: [{ email }, { uid }] },
      });
      if (existing) {
        if (existing.email === email) {
          return res.status(409).json({ error: 'An account with this email already exists.' });
        }
        return res.status(409).json({ error: 'This User ID is already taken.' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: { name, uid, email, passwordHash, role },
        select: { id: true, name: true, uid: true, email: true, role: true },
      });

      await auditLog(user.id, 'register', 'User', user.id, { role }, req.ip);
      res.status(201).json({ message: 'Registration successful. You can now log in.', user });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/auth/login
router.post('/login',
  [
    body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
      if (!user.isActive) {
        return res.status(403).json({ error: 'Your account has been deactivated. Contact admin.' });
      }

      const token = signToken(user);
      setCookie(res, token);
      await auditLog(user.id, 'login', 'User', user.id, null, req.ip);

      res.json({
        message: 'Login successful.',
        user: { id: user.id, name: user.name, uid: user.uid, email: user.email, role: user.role },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/auth/logout
router.post('/logout', verifyToken, async (req, res, next) => {
  try {
    await auditLog(req.user.id, 'logout', 'User', req.user.id, null, req.ip);
    clearCookie(res);
    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/auth/me — check session
router.get('/me', verifyToken, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
