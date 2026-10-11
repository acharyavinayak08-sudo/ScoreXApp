const express = require('express');
const { body } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, requireRole } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/v1/attempts — start an exam attempt (student only)
router.post('/',
  verifyToken, requireRole('student'),
  [
    body('examId').notEmpty().withMessage('examId is required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { examId } = req.body;
      const now = new Date();

      const exam = await prisma.exam.findUnique({
        where: { id: examId },
        include: { _count: { select: { questions: true } } },
      });
      if (!exam) return res.status(404).json({ error: 'Exam not found.' });
      if (!exam.isPublished) return res.status(403).json({ error: 'Exam is not available.' });
      if (exam.startDate && exam.startDate > now) {
        return res.status(403).json({ error: 'Exam has not started yet.' });
      }
      if (exam.endDate && exam.endDate < now) {
        return res.status(403).json({ error: 'Exam has ended.' });
      }
      if (exam._count.questions === 0) {
        return res.status(400).json({ error: 'Exam has no questions.' });
      }

      // Check if student already has an active (incomplete) attempt
      const activeAttempt = await prisma.attempt.findFirst({
        where: { examId, userId: req.user.id, isCompleted: false },
      });
      if (activeAttempt) {
        // Resume it
        const questions = await prisma.question.findMany({
          where: { examId },
          orderBy: { order: 'asc' },
          include: {
            options: {
              orderBy: { order: 'asc' },
              select: { id: true, text: true, order: true },
            },
          },
        });
        const savedAnswers = await prisma.studentAnswer.findMany({
          where: { attemptId: activeAttempt.id },
        });
        return res.json({ attempt: activeAttempt, questions, savedAnswers, resumed: true });
      }

      // Create new attempt
      const attempt = await prisma.attempt.create({
        data: {
          examId,
          userId: req.user.id,
          totalMarks: exam.totalMarks,
        },
      });

      // Fetch questions (no correct answer info for student)
      const questions = await prisma.question.findMany({
        where: { examId },
        orderBy: { order: 'asc' },
        include: {
          options: {
            orderBy: { order: 'asc' },
            select: { id: true, text: true, order: true },
          },
        },
      });

      res.status(201).json({ attempt, questions, savedAnswers: [], resumed: false });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/attempts/:id — get attempt state (student: own only)
router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const attempt = await prisma.attempt.findUnique({
      where: { id: req.params.id },
      include: {
        exam: { select: { id: true, title: true, duration: true, maxViolations: true } },
      },
    });
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });

    // Students can only access their own attempts
    if (req.user.role === 'student' && attempt.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const savedAnswers = await prisma.studentAnswer.findMany({
      where: { attemptId: attempt.id },
    });
    res.json({ attempt, savedAnswers });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/attempts/:id/answer — save a single answer
router.put('/:id/answer',
  verifyToken, requireRole('student'),
  [
    body('questionId').notEmpty().withMessage('questionId is required'),
    body('selectedOptionId').notEmpty().withMessage('selectedOptionId is required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const attempt = await prisma.attempt.findUnique({ where: { id: req.params.id } });
      if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
      if (attempt.userId !== req.user.id) return res.status(403).json({ error: 'Access denied.' });
      if (attempt.isCompleted) return res.status(400).json({ error: 'Attempt is already completed.' });

      // Validate timing server-side
      const exam = await prisma.exam.findUnique({ where: { id: attempt.examId } });
      const elapsed = Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000);
      if (elapsed > exam.duration * 60 + 30) { // 30s grace
        return res.status(400).json({ error: 'Exam time has expired.' });
      }

      const { questionId, selectedOptionId } = req.body;

      // Verify option belongs to question
      const option = await prisma.option.findFirst({
        where: { id: selectedOptionId, questionId },
      });
      if (!option) return res.status(422).json({ error: 'Invalid option for this question.' });

      // Upsert the answer
      await prisma.studentAnswer.upsert({
        where: { attemptId_questionId: { attemptId: attempt.id, questionId } },
        create: { attemptId: attempt.id, questionId, selectedOptionId },
        update: { selectedOptionId },
      });

      res.json({ message: 'Answer saved.' });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/attempts/:id/submit — submit attempt
router.post('/:id/submit',
  verifyToken, requireRole('student'),
  async (req, res, next) => {
    try {
      const attempt = await prisma.attempt.findUnique({
        where: { id: req.params.id },
        include: { exam: true },
      });
      if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
      if (attempt.userId !== req.user.id) return res.status(403).json({ error: 'Access denied.' });
      if (attempt.isCompleted) {
        return res.status(400).json({ error: 'Attempt already submitted.' });
      }

      await scoreAndComplete(attempt, req.body.submittedBy || 'student');

      const completed = await prisma.attempt.findUnique({
        where: { id: attempt.id },
        include: { exam: { select: { title: true, passingMarks: true, showAnswersAfter: true } } },
      });
      res.json({ message: 'Exam submitted successfully.', attempt: completed });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Internal helper: score and complete an attempt ──────────────────────────
async function scoreAndComplete(attempt, submittedBy) {
  const now = new Date();
  const timeSpentSecs = Math.floor((now - new Date(attempt.startedAt)) / 1000);

  // Get all questions with correct options
  const questions = await prisma.question.findMany({
    where: { examId: attempt.examId },
    include: {
      options: { where: { isCorrect: true }, select: { id: true } },
    },
  });

  // Get student answers
  const studentAnswers = await prisma.studentAnswer.findMany({
    where: { attemptId: attempt.id },
  });

  const answerMap = {};
  studentAnswers.forEach(a => { answerMap[a.questionId] = a.selectedOptionId; });

  let score = 0;
  for (const q of questions) {
    const correctOptionId = q.options[0]?.id;
    if (correctOptionId && answerMap[q.id] === correctOptionId) {
      score += q.marks;
    }
  }

  const exam = await prisma.exam.findUnique({ where: { id: attempt.examId } });
  const isPassed = score >= exam.passingMarks;

  await prisma.attempt.update({
    where: { id: attempt.id },
    data: {
      isCompleted: true,
      submittedAt: now,
      score,
      totalMarks: exam.totalMarks,
      isPassed,
      submittedBy,
      timeSpentSecs,
    },
  });
}

module.exports = { router, scoreAndComplete };
