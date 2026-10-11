const express = require('express');
const { body, query } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, requireRole, auditLog } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');

const router = express.Router();
const prisma = new PrismaClient();

// ─── Helper: assert faculty owns exam or user is admin ─────────────────────────
async function assertOwnership(examId, user, res) {
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

// GET /api/v1/exams
// Students: see published, active exams
// Faculty: see their own exams
// Admin: see all
router.get('/', verifyToken, async (req, res, next) => {
  try {
    let where = {};
    if (req.user.role === 'student') {
      const now = new Date();
      where = {
        isPublished: true,
        OR: [
          { startDate: null },
          { startDate: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { endDate: null },
              { endDate: { gte: now } },
            ],
          },
        ],
      };
    } else if (req.user.role === 'faculty') {
      where = { createdById: req.user.id };
    }
    // admin: no filter

    const exams = await prisma.exam.findMany({
      where,
      include: {
        subject: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ exams });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/exams/:id
router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: req.params.id },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { questions: true, attempts: true } },
      },
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    // Students can only view published exams
    if (req.user.role === 'student' && !exam.isPublished) {
      return res.status(403).json({ error: 'This exam is not available.' });
    }
    res.json({ exam });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/exams — faculty or admin
router.post('/',
  verifyToken, requireRole('faculty', 'admin'),
  [
    body('title').trim().isLength({ min: 3, max: 200 }).withMessage('Title must be 3-200 chars'),
    body('subjectId').notEmpty().withMessage('Subject is required'),
    body('duration').isInt({ min: 1, max: 300 }).withMessage('Duration must be 1-300 minutes'),
    body('totalMarks').isInt({ min: 1 }).withMessage('Total marks must be positive'),
    body('passingMarks').isInt({ min: 0 }).withMessage('Passing marks must be non-negative'),
    body('maxViolations').optional().isInt({ min: 1, max: 10 }),
    body('showAnswersAfter').optional().isBoolean(),
    body('instructions').optional().trim().isLength({ max: 2000 }),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const {
        title, subjectId, duration, totalMarks, passingMarks,
        maxViolations, showAnswersAfter, instructions, startDate, endDate
      } = req.body;

      const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
      if (!subject) return res.status(404).json({ error: 'Subject not found.' });

      const exam = await prisma.exam.create({
        data: {
          title,
          subjectId,
          createdById: req.user.id,
          duration,
          totalMarks,
          passingMarks,
          maxViolations: maxViolations || 3,
          showAnswersAfter: showAnswersAfter !== undefined ? showAnswersAfter : true,
          instructions,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
        },
        include: { subject: true },
      });

      await auditLog(req.user.id, 'exam_create', 'Exam', exam.id, { title }, req.ip);
      res.status(201).json({ exam });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/v1/exams/:id
router.put('/:id',
  verifyToken, requireRole('faculty', 'admin'),
  [
    body('title').optional().trim().isLength({ min: 3, max: 200 }),
    body('duration').optional().isInt({ min: 1, max: 300 }),
    body('totalMarks').optional().isInt({ min: 1 }),
    body('passingMarks').optional().isInt({ min: 0 }),
    body('maxViolations').optional().isInt({ min: 1, max: 10 }),
    body('showAnswersAfter').optional().isBoolean(),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const exam = await assertOwnership(req.params.id, req.user, res);
      if (!exam) return;

      const {
        title, subjectId, duration, totalMarks, passingMarks,
        maxViolations, showAnswersAfter, instructions, startDate, endDate
      } = req.body;

      const updated = await prisma.exam.update({
        where: { id: exam.id },
        data: {
          ...(title && { title }),
          ...(subjectId && { subjectId }),
          ...(duration && { duration }),
          ...(totalMarks !== undefined && { totalMarks }),
          ...(passingMarks !== undefined && { passingMarks }),
          ...(maxViolations !== undefined && { maxViolations }),
          ...(showAnswersAfter !== undefined && { showAnswersAfter }),
          ...(instructions !== undefined && { instructions }),
          ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
          ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        },
        include: { subject: true },
      });

      await auditLog(req.user.id, 'exam_update', 'Exam', exam.id, { title }, req.ip);
      res.json({ exam: updated });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/exams/:id/publish — toggle publish
router.post('/:id/publish', verifyToken, requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const exam = await assertOwnership(req.params.id, req.user, res);
    if (!exam) return;

    // Check that exam has questions before publishing
    if (!exam.isPublished) {
      const qCount = await prisma.question.count({ where: { examId: exam.id } });
      if (qCount === 0) {
        return res.status(400).json({ error: 'Cannot publish an exam with no questions.' });
      }
    }

    const updated = await prisma.exam.update({
      where: { id: exam.id },
      data: { isPublished: !exam.isPublished },
    });

    await auditLog(req.user.id, updated.isPublished ? 'exam_publish' : 'exam_unpublish', 'Exam', exam.id, null, req.ip);
    res.json({ exam: updated, message: updated.isPublished ? 'Exam published.' : 'Exam unpublished.' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/exams/:id
router.delete('/:id', verifyToken, requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const exam = await assertOwnership(req.params.id, req.user, res);
    if (!exam) return;

    await prisma.exam.delete({ where: { id: exam.id } });
    await auditLog(req.user.id, 'exam_delete', 'Exam', exam.id, { title: exam.title }, req.ip);
    res.json({ message: 'Exam deleted.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/exams/:id/attempts — faculty/admin: see all attempts for their exam
router.get('/:id/attempts', verifyToken, requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const exam = await assertOwnership(req.params.id, req.user, res);
    if (!exam) return;

    const attempts = await prisma.attempt.findMany({
      where: { examId: exam.id, isCompleted: true },
      include: {
        user: { select: { id: true, name: true, uid: true, email: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
    res.json({ attempts });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
