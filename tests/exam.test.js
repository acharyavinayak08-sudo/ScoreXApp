/**
 * Exam Flow Tests: create exam, attempt, submit, score validation
 */
const request = require('supertest');
const app = require('../server/index');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// ─── Unique ID helper ─────────────────────────────────────────────────────────
let _counter = 0;
function uid() { return `${Date.now()}-${++_counter}-${Math.random().toString(36).slice(2, 6)}`; }

// ─── Test data ────────────────────────────────────────────────────────────────
let facultyAgent, studentAgent;
let testSubjectId, testExamId;
let createdUserIds = [];

async function createUser(role) {
  const id = uid();
  const u = await prisma.user.create({
    data: {
      name: `Test ${role} ${id}`,
      uid: `E-${role.slice(0, 2).toUpperCase()}-${id}`,
      email: `${role}-${id}@test-exam.com`,
      passwordHash: await bcrypt.hash('Exam@1234', 10),
      role,
    },
  });
  createdUserIds.push(u.id);
  return u;
}

beforeAll(async () => {
  const f = await createUser('faculty');
  const s = await createUser('student');

  facultyAgent = request.agent(app);
  studentAgent = request.agent(app);

  await facultyAgent.post('/api/v1/auth/login').send({ email: f.email, password: 'Exam@1234' });
  await studentAgent.post('/api/v1/auth/login').send({ email: s.email, password: 'Exam@1234' });

  const sub = await prisma.subject.upsert({
    where: { code: 'TEST-EXAM-SUB' },
    update: {},
    create: { name: 'Test Subject for Exams', code: 'TEST-EXAM-SUB' },
  });
  testSubjectId = sub.id;
});

afterAll(async () => {
  // Delete child records in dependency order before deleting users
  await prisma.securityViolation.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.studentAnswer.deleteMany({
    where: { attempt: { userId: { in: createdUserIds } } },
  });
  await prisma.attempt.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
  // Delete exams created by test faculty
  await prisma.exam.deleteMany({ where: { createdById: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

// ─── Exam CRUD ────────────────────────────────────────────────────────────────
describe('Exam management (faculty)', () => {
  it('faculty can create an exam', async () => {
    const res = await facultyAgent.post('/api/v1/exams').send({
      title: 'Test Exam ' + uid(),
      subjectId: testSubjectId,
      duration: 10,
      totalMarks: 5,
      passingMarks: 3,
    });
    expect(res.status).toBe(201);
    expect(res.body.exam).toBeDefined();
    testExamId = res.body.exam.id;
  });

  it('faculty can add a question with options', async () => {
    const res = await facultyAgent.post('/api/v1/questions').send({
      examId: testExamId,
      text: 'What is 2 + 2?',
      marks: 1,
      options: [
        { text: '3', isCorrect: false },
        { text: '4', isCorrect: true },
        { text: '5', isCorrect: false },
        { text: '22', isCorrect: false },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.question.options.length).toBe(4);
  });

  it('faculty can publish exam after adding questions', async () => {
    // Add more questions to reach a reasonable count
    for (let i = 1; i <= 3; i++) {
      await facultyAgent.post('/api/v1/questions').send({
        examId: testExamId,
        text: `Filler question ${i}`,
        marks: 1,
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
        ],
      });
    }
    const res = await facultyAgent.post(`/api/v1/exams/${testExamId}/publish`);
    expect(res.status).toBe(200);
    expect(res.body.exam.isPublished).toBe(true);
  });

  it('cannot publish exam with no questions', async () => {
    const newExam = await facultyAgent.post('/api/v1/exams').send({
      title: 'Empty Exam ' + uid(),
      subjectId: testSubjectId,
      duration: 5,
      totalMarks: 10,
      passingMarks: 5,
    });
    const res = await facultyAgent.post(`/api/v1/exams/${newExam.body.exam.id}/publish`);
    expect(res.status).toBe(400);
  });

  it('another faculty cannot modify this exam', async () => {
    const f2 = await createUser('faculty');
    const agent2 = request.agent(app);
    await agent2.post('/api/v1/auth/login').send({ email: f2.email, password: 'Exam@1234' });
    const res = await agent2.post(`/api/v1/exams/${testExamId}/publish`);
    expect(res.status).toBe(403);
  });
});

// ─── Exam Attempt Flow ────────────────────────────────────────────────────────
describe('Exam attempt flow (student)', () => {
  let attemptId;

  it('student can start exam and questions have no isCorrect field', async () => {
    const res = await studentAgent.post('/api/v1/attempts').send({ examId: testExamId });
    expect(res.status).toBe(201);
    expect(res.body.attempt).toBeDefined();
    expect(res.body.questions.length).toBeGreaterThan(0);
    // Correct answers must NOT be in response
    res.body.questions.forEach(q => {
      q.options.forEach(o => {
        expect(o.isCorrect).toBeUndefined();
      });
    });
    attemptId = res.body.attempt.id;
  });

  it('student can save an answer', async () => {
    const qRes = await studentAgent.post('/api/v1/attempts').send({ examId: testExamId });
    // Resume gives back the same attempt
    const questions = qRes.body.questions;
    const firstQ = questions[0];
    const firstOpt = firstQ.options[0];

    const res = await studentAgent.put(`/api/v1/attempts/${attemptId}/answer`).send({
      questionId: firstQ.id,
      selectedOptionId: firstOpt.id,
    });
    expect(res.status).toBe(200);
  });

  it('student can submit exam and receives a numeric score', async () => {
    const res = await studentAgent.post(`/api/v1/attempts/${attemptId}/submit`).send({ submittedBy: 'student' });
    expect(res.status).toBe(200);
    expect(res.body.attempt.isCompleted).toBe(true);
    expect(typeof res.body.attempt.score).toBe('number');
  });

  it('student cannot submit the same attempt twice', async () => {
    const res = await studentAgent.post(`/api/v1/attempts/${attemptId}/submit`).send({ submittedBy: 'student' });
    expect(res.status).toBe(400);
  });

  it('result is visible after submission with answer review', async () => {
    const res = await studentAgent.get(`/api/v1/results/${attemptId}`);
    expect(res.status).toBe(200);
    expect(res.body.attempt.isCompleted).toBe(true);
    expect(Array.isArray(res.body.review)).toBe(true);
  });
});

// ─── Data isolation ───────────────────────────────────────────────────────────
describe('Data isolation', () => {
  it('another student cannot view a different student result', async () => {
    const s2 = await createUser('student');
    const agent2 = request.agent(app);
    await agent2.post('/api/v1/auth/login').send({ email: s2.email, password: 'Exam@1234' });

    // Start a new attempt as original student then check if s2 can access it
    const attRes = await studentAgent.post('/api/v1/attempts').send({ examId: testExamId });
    if (attRes.body.attempt && !attRes.body.attempt.isCompleted) {
      // Submit it first
      await studentAgent.post(`/api/v1/attempts/${attRes.body.attempt.id}/submit`).send({ submittedBy: 'student' });
      const res = await agent2.get(`/api/v1/results/${attRes.body.attempt.id}`);
      expect([403, 404]).toContain(res.status);
    }
  });
});
