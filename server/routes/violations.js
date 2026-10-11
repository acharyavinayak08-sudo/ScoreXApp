const express = require('express');
const { body } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, requireRole } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');
const { scoreAndComplete } = require('./attempts');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/v1/violations — record a security violation
router.post('/',
  verifyToken, requireRole('student'),
  [
    body('attemptId').notEmpty().withMessage('attemptId is required'),
    body('type').notEmpty().isIn([
      'tab_switch', 'fullscreen_exit', 'contextmenu', 'shortcut', 'copy', 'paste', 'cut', 'blur'
    ]).withMessage('Invalid violation type'),
    body('detail').optional().trim().isLength({ max: 200 }),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { attemptId, type, detail } = req.body;

      const attempt = await prisma.attempt.findUnique({
        where: { id: attemptId },
        include: { exam: { select: { maxViolations: true } } },
      });
      if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
      if (attempt.userId !== req.user.id) return res.status(403).json({ error: 'Access denied.' });
      if (attempt.isCompleted) {
        return res.json({ message: 'Attempt already completed.', autoSubmit: false });
      }

      // Record violation
      await prisma.securityViolation.create({
        data: { attemptId, userId: req.user.id, type, detail },
      });

      // Update violation count
      const violationCount = await prisma.securityViolation.count({ where: { attemptId } });
      await prisma.attempt.update({
        where: { id: attemptId },
        data: { violationCount },
      });

      const maxViolations = attempt.exam.maxViolations || 3;
      const autoSubmit = violationCount >= maxViolations;

      if (autoSubmit) {
        await scoreAndComplete(attempt, 'violation');
      }

      res.json({
        message: 'Violation recorded.',
        violationCount,
        maxViolations,
        autoSubmit,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
