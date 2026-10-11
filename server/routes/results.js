const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/v1/results — student: my results; faculty/admin: all
router.get('/', verifyToken, async (req, res, next) => {
  try {
    let where = { isCompleted: true };
    if (req.user.role === 'student') {
      where.userId = req.user.id;
    }

    const attempts = await prisma.attempt.findMany({
      where,
      include: {
        exam: { select: { id: true, title: true, totalMarks: true, passingMarks: true, subject: { select: { name: true } } } },
        user: { select: { id: true, name: true, uid: true } },
        _count: { select: { violations: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });

    res.json({ results: attempts });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/results/:attemptId — detailed result with answer review
router.get('/:attemptId', verifyToken, async (req, res, next) => {
  try {
    const attempt = await prisma.attempt.findUnique({
      where: { id: req.params.attemptId },
      include: {
        exam: {
          select: {
            id: true, title: true, totalMarks: true, passingMarks: true,
            showAnswersAfter: true, duration: true,
            subject: { select: { name: true } },
          },
        },
        user: { select: { id: true, name: true, uid: true, email: true } },
      },
    });

    if (!attempt) return res.status(404).json({ error: 'Result not found.' });
    if (!attempt.isCompleted) return res.status(400).json({ error: 'Exam not yet submitted.' });

    // Students can only see their own results
    if (req.user.role === 'student' && attempt.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const canSeeAnswers = attempt.exam.showAnswersAfter ||
      req.user.role === 'faculty' || req.user.role === 'admin';

    // Get student answers
    const studentAnswers = await prisma.studentAnswer.findMany({
      where: { attemptId: attempt.id },
      include: {
        selectedOption: { select: { id: true, text: true, isCorrect: true } },
      },
    });

    // Get questions with all options (including correct flags if allowed)
    const questions = await prisma.question.findMany({
      where: { examId: attempt.examId },
      orderBy: { order: 'asc' },
      include: {
        options: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            text: true,
            order: true,
            ...(canSeeAnswers && { isCorrect: true }),
          },
        },
      },
    });

    // Build answer review
    const answerMap = {};
    studentAnswers.forEach(a => { answerMap[a.questionId] = a; });

    const review = canSeeAnswers ? questions.map(q => ({
      questionId: q.id,
      questionText: q.text,
      marks: q.marks,
      options: q.options,
      selectedOptionId: answerMap[q.id]?.selectedOptionId || null,
      selectedOptionText: answerMap[q.id]?.selectedOption?.text || null,
      isCorrect: answerMap[q.id]?.selectedOption?.isCorrect || false,
      correctOption: q.options.find(o => o.isCorrect) || null,
    })) : null;

    // Get violations
    const violations = await prisma.securityViolation.findMany({
      where: { attemptId: attempt.id },
      orderBy: { occurredAt: 'asc' },
    });

    const percent = attempt.totalMarks > 0
      ? Math.round((attempt.score / attempt.totalMarks) * 100)
      : 0;

    res.json({
      attempt: { ...attempt, percent },
      review,
      violations,
      canSeeAnswers,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
