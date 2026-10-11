const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/v1/reports/weekly — weekly progress reports for the logged-in student (or any user for faculty/admin)
router.get('/weekly', verifyToken, async (req, res, next) => {
  try {
    const targetUserId = req.query.userId && req.user.role !== 'student'
      ? req.query.userId
      : req.user.id;

    // Generate/refresh weekly reports from actual attempt data
    await generateWeeklyReports(targetUserId);

    const reports = await prisma.weeklyReport.findMany({
      where: { userId: targetUserId },
      orderBy: { weekStart: 'desc' },
      take: 12, // last 12 weeks
    });

    res.json({ reports });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/reports/progress — full progress summary for current user
router.get('/progress', verifyToken, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const attempts = await prisma.attempt.findMany({
      where: { userId, isCompleted: true },
      include: {
        exam: { select: { title: true, totalMarks: true, subject: { select: { name: true } } } },
        _count: { select: { violations: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });

    const total = attempts.length;
    const passed = attempts.filter(a => a.isPassed).length;
    const avgScore = total > 0
      ? Math.round(attempts.reduce((s, a) => s + (a.totalMarks > 0 ? (a.score / a.totalMarks) * 100 : 0), 0) / total)
      : 0;
    const totalViolations = attempts.reduce((s, a) => s + a._count.violations, 0);

    // Subject breakdown
    const subjectMap = {};
    attempts.forEach(a => {
      const subName = a.exam.subject?.name || 'Unknown';
      if (!subjectMap[subName]) subjectMap[subName] = { attempts: 0, totalPct: 0 };
      subjectMap[subName].attempts++;
      subjectMap[subName].totalPct += a.totalMarks > 0 ? (a.score / a.totalMarks) * 100 : 0;
    });
    const subjectBreakdown = Object.entries(subjectMap).map(([subject, data]) => ({
      subject,
      attempts: data.attempts,
      avgScore: Math.round(data.totalPct / data.attempts),
    }));

    res.json({
      summary: { total, passed, failed: total - passed, avgScore, totalViolations },
      subjectBreakdown,
      recentAttempts: attempts.slice(0, 10).map(a => ({
        id: a.id,
        examTitle: a.exam.title,
        subject: a.exam.subject?.name,
        score: a.score,
        totalMarks: a.totalMarks,
        percent: a.totalMarks > 0 ? Math.round((a.score / a.totalMarks) * 100) : 0,
        isPassed: a.isPassed,
        submittedAt: a.submittedAt,
        violationCount: a._count.violations,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── Internal helper: generate/update weekly reports ─────────────────────────
async function generateWeeklyReports(userId) {
  const attempts = await prisma.attempt.findMany({
    where: { userId, isCompleted: true },
    include: { _count: { select: { violations: true } } },
    orderBy: { submittedAt: 'asc' },
  });

  if (attempts.length === 0) return;

  // Group by ISO week
  const weeks = {};
  for (const a of attempts) {
    if (!a.submittedAt) continue;
    const d = new Date(a.submittedAt);
    const dayOfWeek = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    const key = monday.toISOString();
    if (!weeks[key]) {
      weeks[key] = { weekStart: monday, weekEnd: sunday, scores: [], violations: 0 };
    }
    const pct = a.totalMarks > 0 ? (a.score / a.totalMarks) * 100 : 0;
    weeks[key].scores.push(pct);
    weeks[key].violations += a._count.violations;
  }

  for (const [, week] of Object.entries(weeks)) {
    const avgScore = week.scores.reduce((s, v) => s + v, 0) / week.scores.length;
    const best = Math.max(...week.scores);
    await prisma.weeklyReport.upsert({
      where: { userId_weekStart: { userId, weekStart: week.weekStart } },
      create: {
        userId,
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        examsAttempted: week.scores.length,
        avgScore: Math.round(avgScore * 100) / 100,
        bestScore: Math.round(best * 100) / 100,
        totalViolations: week.violations,
      },
      update: {
        weekEnd: week.weekEnd,
        examsAttempted: week.scores.length,
        avgScore: Math.round(avgScore * 100) / 100,
        bestScore: Math.round(best * 100) / 100,
        totalViolations: week.violations,
      },
    });
  }
}

module.exports = router;
