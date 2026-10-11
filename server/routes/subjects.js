const express = require('express');
const { body } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, requireRole } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/v1/subjects — all authenticated users
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const subjects = await prisma.subject.findMany({
      orderBy: { name: 'asc' },
    });
    res.json({ subjects });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/subjects — admin only
router.post('/',
  verifyToken, requireRole('admin'),
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Subject name required'),
    body('code').trim().isLength({ min: 1, max: 20 }).withMessage('Subject code required'),
    body('description').optional().trim().isLength({ max: 500 }),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { name, code, description } = req.body;
      const existing = await prisma.subject.findFirst({
        where: { OR: [{ name }, { code }] },
      });
      if (existing) {
        return res.status(409).json({ error: 'Subject name or code already exists.' });
      }
      const subject = await prisma.subject.create({ data: { name, code, description } });
      res.status(201).json({ subject });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/subjects/:id — admin only
router.delete('/:id', verifyToken, requireRole('admin'), async (req, res, next) => {
  try {
    await prisma.subject.delete({ where: { id: req.params.id } });
    res.json({ message: 'Subject deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
