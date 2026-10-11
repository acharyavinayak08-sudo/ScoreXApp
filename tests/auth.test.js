/**
 * Authentication & Authorization Tests
 */
const request = require('supertest');
const app = require('../server/index');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// ─── Unique counter to prevent email collisions when tests run fast ───────────
let _counter = 0;
function uid() { return `${Date.now()}-${++_counter}-${Math.random().toString(36).slice(2, 6)}`; }

// ─── Test helpers ──────────────────────────────────────────────────────────────
async function createTestUser(overrides = {}) {
  const id = uid();
  const defaults = {
    name: 'Test User',
    uid: `TU-${id}`,
    email: `test-${id}@test.com`,
    passwordHash: await bcrypt.hash('Password@123', 10),
    role: 'student',
  };
  return prisma.user.create({ data: { ...defaults, ...overrides } });
}

// ─── Cleanup ───────────────────────────────────────────────────────────────────
afterAll(async () => {
  // Delete audit logs for test users first
  await prisma.auditLog.deleteMany({
    where: { user: { email: { endsWith: '@test.com' } } },
  });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@test.com' } } });
  await prisma.$disconnect();
});

// ─── Registration ──────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/register', () => {
  it('registers a new student', async () => {
    const id = uid();
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Test Student', uid: `STU-${id}`, email: `student-reg-${id}@test.com`, password: 'Password@1', role: 'student' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('student');
  });

  it('rejects admin registration via public endpoint', async () => {
    const id = uid();
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Bad Admin', uid: `BA-${id}`, email: `badmin-${id}@test.com`, password: 'Password@1', role: 'admin' });
    expect(res.status).toBe(422);
  });

  it('rejects duplicate email', async () => {
    const id = uid();
    const email = `dup-${id}@test.com`;
    await createTestUser({ email, uid: `DUP-A-${id}` });
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Dup', uid: `DUP-B-${id}`, email, password: 'Password@1', role: 'student' });
    expect(res.status).toBe(409);
  });

  it('rejects weak passwords', async () => {
    const id = uid();
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Weak', uid: `W-${id}`, email: `weak-${id}@test.com`, password: 'weak', role: 'student' });
    expect(res.status).toBe(422);
  });
});

// ─── Login ─────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/login', () => {
  let testEmail, testPw;
  beforeAll(async () => {
    testPw = 'Test@1234';
    const u = await createTestUser({ passwordHash: await bcrypt.hash(testPw, 10), uid: `LT-${uid()}` });
    testEmail = u.email;
  });

  it('logs in with correct credentials and sets cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPw });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.body.user.email).toBe(testEmail);
  });

  it('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'WrongPass@1' });
    expect(res.status).toBe(401);
  });

  it('rejects non-existent email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@test.com', password: 'any' });
    expect(res.status).toBe(401);
  });
});

// ─── Session / /me ────────────────────────────────────────────────────────────
describe('GET /api/v1/auth/me', () => {
  it('returns 401 without cookie', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns user info with valid cookie', async () => {
    const agent = request.agent(app);
    const pw = 'Me@12345';
    const u = await createTestUser({ passwordHash: await bcrypt.hash(pw, 10), uid: `ME-${uid()}` });
    await agent.post('/api/v1/auth/login').send({ email: u.email, password: pw });
    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(u.id);
  });
});

// ─── Role-based access ────────────────────────────────────────────────────────
describe('Role-based authorization', () => {
  let studentAgent, facultyAgent, adminAgent;

  beforeAll(async () => {
    const pw = 'Role@1234';
    const hash = await bcrypt.hash(pw, 10);

    // Create sequentially to avoid same-ms timestamp collisions
    const s = await createTestUser({ passwordHash: hash, role: 'student', uid: `RS-${uid()}` });
    const f = await createTestUser({ passwordHash: hash, role: 'faculty', uid: `RF-${uid()}` });
    const a = await createTestUser({ passwordHash: hash, role: 'admin',   uid: `RA-${uid()}` });

    studentAgent = request.agent(app);
    facultyAgent = request.agent(app);
    adminAgent   = request.agent(app);

    await studentAgent.post('/api/v1/auth/login').send({ email: s.email, password: pw });
    await facultyAgent.post('/api/v1/auth/login').send({ email: f.email, password: pw });
    await adminAgent.post('/api/v1/auth/login').send({ email: a.email, password: pw });
  });

  it('student cannot access /api/v1/admin/stats', async () => {
    const res = await studentAgent.get('/api/v1/admin/stats');
    expect(res.status).toBe(403);
  });

  it('faculty cannot access /api/v1/admin/stats', async () => {
    const res = await facultyAgent.get('/api/v1/admin/stats');
    expect(res.status).toBe(403);
  });

  it('admin can access /api/v1/admin/stats', async () => {
    const res = await adminAgent.get('/api/v1/admin/stats');
    expect(res.status).toBe(200);
  });

  it('student cannot create an exam', async () => {
    const res = await studentAgent.post('/api/v1/exams').send({ title: 'Hack', duration: 10, totalMarks: 10 });
    expect(res.status).toBe(403);
  });

  it('unauthenticated user cannot access /api/v1/exams', async () => {
    const res = await request(app).get('/api/v1/exams');
    expect(res.status).toBe(401);
  });
});

// ─── Deactivated user cannot login ───────────────────────────────────────────
describe('Deactivated account', () => {
  it('blocks deactivated user from logging in', async () => {
    const pw = 'Deact@123';
    const u = await createTestUser({
      passwordHash: await bcrypt.hash(pw, 10),
      isActive: false,
      uid: `DA-${uid()}`,
    });
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: pw });
    expect(loginRes.status).toBe(403);
  });
});
