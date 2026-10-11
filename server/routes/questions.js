const express = require('express');
const { body } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, requireRole } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');

const router = express.Router();
const prisma = new PrismaClient();

// ─── Helper: check faculty owns the exam ─────────────────────────────────────
async function assertExamOwnership(examId, user, res) {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) {
    res.status(404).json({ error: 'Exam not found.' });
    return null;
  }
  if (user.role !== 'admin' && exam.createdById !== user.id) {
    res.status(403).json({ error: 'You do not have permission to modify this exam.' });
    return null;
  }
  return exam;
}

// GET /api/v1/exams/:examId/questions
// Students: get questions WITHOUT correct answer info (while exam is live)
// Faculty/Admin: get full question data including which option is correct
router.get('/exam/:examId', verifyToken, async (req, res, next) => {
  try {
    const { examId } = req.params;
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    // Students can only access published exams
    if (req.user.role === 'student' && !exam.isPublished) {
      return res.status(403).json({ error: 'Exam not available.' });
    }

    const showCorrect = req.user.role === 'faculty' || req.user.role === 'admin';

    const questions = await prisma.question.findMany({
      where: { examId },
      orderBy: { order: 'asc' },
      include: {
        options: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            text: true,
            order: true,
            // Only expose isCorrect to faculty/admin
            ...(showCorrect && { isCorrect: true }),
          },
        },
      },
    });
    res.json({ questions });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/questions — add question to exam
router.post('/',
  verifyToken, requireRole('faculty', 'admin'),
  [
    body('examId').notEmpty().withMessage('examId is required'),
    body('text').trim().isLength({ min: 3, max: 2000 }).withMessage('Question text required'),
    body('marks').optional().isInt({ min: 1 }).withMessage('Marks must be positive integer'),
    body('options').isArray({ min: 2, max: 6 }).withMessage('Provide 2-6 options'),
    body('options.*.text').trim().notEmpty().withMessage('Each option must have text'),
    body('options.*.isCorrect').isBoolean().withMessage('Each option must specify isCorrect'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { examId, text, marks, options } = req.body;

      const exam = await assertExamOwnership(examId, req.user, res);
      if (!exam) return;

      // Validate exactly one correct option
      const correctCount = options.filter(o => o.isCorrect).length;
      if (correctCount !== 1) {
        return res.status(422).json({ error: 'Exactly one option must be marked as correct.' });
      }

      // Get current question count to set order
      const qCount = await prisma.question.count({ where: { examId } });

      const question = await prisma.question.create({
        data: {
          examId,
          text,
          marks: marks || 1,
          order: qCount,
          options: {
            create: options.map((o, i) => ({
              text: o.text,
              isCorrect: o.isCorrect,
              order: i,
            })),
          },
        },
        include: { options: { orderBy: { order: 'asc' } } },
      });

      // Auto-update totalMarks on exam
      const allQuestions = await prisma.question.findMany({ where: { examId } });
      const totalMarks = allQuestions.reduce((s, q) => s + q.marks, 0);
      await prisma.exam.update({ where: { id: examId }, data: { totalMarks } });

      res.status(201).json({ question });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/v1/questions/:id
router.put('/:id',
  verifyToken, requireRole('faculty', 'admin'),
  [
    body('text').optional().trim().isLength({ min: 3, max: 2000 }),
    body('marks').optional().isInt({ min: 1 }),
    body('options').optional().isArray({ min: 2, max: 6 }),
    body('options.*.text').optional().trim().notEmpty(),
    body('options.*.isCorrect').optional().isBoolean(),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const question = await prisma.question.findUnique({
        where: { id: req.params.id },
        include: { options: true },
      });
      if (!question) return res.status(404).json({ error: 'Question not found.' });

      const exam = await assertExamOwnership(question.examId, req.user, res);
      if (!exam) return;

      const { text, marks, options } = req.body;

      if (options) {
        const correctCount = options.filter(o => o.isCorrect).length;
        if (correctCount !== 1) {
          return res.status(422).json({ error: 'Exactly one option must be marked as correct.' });
        }
        // Delete old options and recreate
        await prisma.option.deleteMany({ where: { questionId: question.id } });
        await prisma.option.createMany({
          data: options.map((o, i) => ({
            questionId: question.id,
            text: o.text,
            isCorrect: o.isCorrect,
            order: i,
          })),
        });
      }

      const updated = await prisma.question.update({
        where: { id: question.id },
        data: {
          ...(text && { text }),
          ...(marks && { marks }),
        },
        include: { options: { orderBy: { order: 'asc' } } },
      });

      // Recalculate totalMarks
      const allQuestions = await prisma.question.findMany({ where: { examId: question.examId } });
      const totalMarks = allQuestions.reduce((s, q) => s + q.marks, 0);
      await prisma.exam.update({ where: { id: question.examId }, data: { totalMarks } });

      res.json({ question: updated });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/questions/:id
router.delete('/:id', verifyToken, requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const question = await prisma.question.findUnique({ where: { id: req.params.id } });
    if (!question) return res.status(404).json({ error: 'Question not found.' });

    const exam = await assertExamOwnership(question.examId, req.user, res);
    if (!exam) return;

    await prisma.question.delete({ where: { id: question.id } });

    // Recalculate totalMarks
    const remaining = await prisma.question.findMany({ where: { examId: question.examId } });
    const totalMarks = remaining.reduce((s, q) => s + q.marks, 0);
    await prisma.exam.update({ where: { id: question.examId }, data: { totalMarks } });

    res.json({ message: 'Question deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
