const express = require('express');
const bcrypt = require('bcryptjs');
const { body, query } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, requireRole, auditLog } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');

const router = express.Router();
const prisma = new PrismaClient();

// All admin routes require admin role
router.use(verifyToken, requireRole('admin'));

// GET /api/v1/admin/stats — system-wide statistics
router.get('/stats', async (req, res, next) => {
  try {
    const [userCount, examCount, attemptCount, violationCount] = await Promise.all([
      prisma.user.count(),
      prisma.exam.count(),
      prisma.attempt.count({ where: { isCompleted: true } }),
      prisma.securityViolation.count(),
    ]);

    const roleBreakdown = await prisma.user.groupBy({
      by: ['role'],
      _count: { role: true },
    });

    const recentAttempts = await prisma.attempt.findMany({
      where: { isCompleted: true },
      include: {
        user: { select: { name: true, uid: true } },
        exam: { select: { title: true } },
        _count: { select: { violations: true } },
      },
      orderBy: { submittedAt: 'desc' },
      take: 10,
    });

    res.json({
      stats: { userCount, examCount, attemptCount, violationCount },
      roleBreakdown: roleBreakdown.map(r => ({ role: r.role, count: r._count.role })),
      recentAttempts,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/users — list all users
router.get('/users', async (req, res, next) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      ...(role && { role }),
      ...(search && {
        OR: [
          { name: { contains: search } },
          { email: { contains: search } },
          { uid: { contains: search } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, name: true, uid: true, email: true, role: true, isActive: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/admin/users/:id — update user (activate/deactivate, change role)
router.put('/users/:id',
  [
    body('isActive').optional().isBoolean(),
    body('role').optional().isIn(['student', 'faculty', 'admin']),
    body('password').optional().isLength({ min: 8 }),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { isActive, role, password } = req.body;
      const targetId = req.params.id;

      // Prevent self-deactivation
      if (targetId === req.user.id && isActive === false) {
        return res.status(400).json({ error: 'You cannot deactivate your own account.' });
      }

      const updateData = {};
      if (isActive !== undefined) updateData.isActive = isActive;
      if (role) updateData.role = role;
      if (password) updateData.passwordHash = await bcrypt.hash(password, 12);

      const user = await prisma.user.update({
        where: { id: targetId },
        data: updateData,
        select: { id: true, name: true, uid: true, email: true, role: true, isActive: true },
      });

      await auditLog(req.user.id, 'admin_user_update', 'User', targetId, { isActive, role }, req.ip);
      res.json({ user });
    } catch (err) {
      if (err.code === 'P2025') return res.status(404).json({ error: 'User not found.' });
      next(err);
    }
  }
);

// DELETE /api/v1/admin/users/:id
router.delete('/users/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account.' });
    }
    await prisma.user.delete({ where: { id: req.params.id } });
    await auditLog(req.user.id, 'admin_user_delete', 'User', req.params.id, null, req.ip);
    res.json({ message: 'User deleted.' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found.' });
    next(err);
  }
});

// GET /api/v1/admin/audit — audit logs
router.get('/audit', async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        include: { user: { select: { name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.auditLog.count(),
    ]);

    res.json({ logs, total, page: parseInt(page) });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/violations — all violations
router.get('/violations', async (req, res, next) => {
  try {
    const violations = await prisma.securityViolation.findMany({
      include: {
        user: { select: { name: true, uid: true, email: true } },
        attempt: { include: { exam: { select: { title: true } } } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
    res.json({ violations });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/exams — all exams
router.get('/exams', async (req, res, next) => {
  try {
    const exams = await prisma.exam.findMany({
      include: {
        subject: { select: { name: true } },
        createdBy: { select: { name: true, email: true } },
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ exams });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
