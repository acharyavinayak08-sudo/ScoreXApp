/**
 * ScoreX Seed Script
 * Creates: 1 admin, 2 faculty, 3 students, 4 subjects, 3 exams with questions
 *
 * Usage: node server/seed.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function hash(p) {
  return bcrypt.hash(p, 12);
}

async function main() {
  console.log('🌱 Seeding ScoreX database...\n');

  // ─── Admin ─────────────────────────────────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@scorex.local';
  const adminPw = process.env.ADMIN_PASSWORD || 'Admin@1234';

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'System Admin',
      uid: 'ADMIN001',
      email: adminEmail,
      passwordHash: await hash(adminPw),
      role: 'admin',
    },
  });
  console.log(`✓ Admin: ${adminEmail} / ${adminPw}`);

  // ─── Faculty ───────────────────────────────────────────────────────────────
  const faculty1 = await prisma.user.upsert({
    where: { email: 'faculty1@scorex.local' },
    update: {},
    create: {
      name: 'Prof. Ananya Sharma',
      uid: 'FAC001',
      email: 'faculty1@scorex.local',
      passwordHash: await hash('Faculty@123'),
      role: 'faculty',
    },
  });
  const faculty2 = await prisma.user.upsert({
    where: { email: 'faculty2@scorex.local' },
    update: {},
    create: {
      name: 'Prof. Rajiv Mehta',
      uid: 'FAC002',
      email: 'faculty2@scorex.local',
      passwordHash: await hash('Faculty@123'),
      role: 'faculty',
    },
  });
  console.log('✓ Faculty: faculty1@scorex.local / Faculty@123');
  console.log('✓ Faculty: faculty2@scorex.local / Faculty@123');

  // ─── Students ──────────────────────────────────────────────────────────────
  const student1 = await prisma.user.upsert({
    where: { email: 'student1@scorex.local' },
    update: {},
    create: {
      name: 'Riya Verma',
      uid: 'STU001',
      email: 'student1@scorex.local',
      passwordHash: await hash('Student@123'),
      role: 'student',
    },
  });
  await prisma.user.upsert({
    where: { email: 'student2@scorex.local' },
    update: {},
    create: {
      name: 'Arjun Patel',
      uid: 'STU002',
      email: 'student2@scorex.local',
      passwordHash: await hash('Student@123'),
      role: 'student',
    },
  });
  await prisma.user.upsert({
    where: { email: 'student3@scorex.local' },
    update: {},
    create: {
      name: 'Priya Singh',
      uid: 'STU003',
      email: 'student3@scorex.local',
      passwordHash: await hash('Student@123'),
      role: 'student',
    },
  });
  console.log('✓ Students: student1/2/3@scorex.local / Student@123');

  // ─── Subjects ──────────────────────────────────────────────────────────────
  const progSubject = await prisma.subject.upsert({
    where: { code: 'CS101' },
    update: {},
    create: { name: 'Programming Fundamentals', code: 'CS101', description: 'Core programming concepts' },
  });
  const webSubject = await prisma.subject.upsert({
    where: { code: 'WD201' },
    update: {},
    create: { name: 'Web Development', code: 'WD201', description: 'HTML, CSS, JavaScript & web technologies' },
  });
  const dbSubject = await prisma.subject.upsert({
    where: { code: 'DB301' },
    update: {},
    create: { name: 'Database Systems', code: 'DB301', description: 'Relational databases and SQL' },
  });
  const mathSubject = await prisma.subject.upsert({
    where: { code: 'MA101' },
    update: {},
    create: { name: 'Discrete Mathematics', code: 'MA101', description: 'Logic, sets, and graph theory' },
  });
  console.log('✓ 4 subjects created');

  // ─── Exams ─────────────────────────────────────────────────────────────────

  // Helper: create exam with questions and options
  async function createExam({ title, subjectId, createdById, duration, totalMarks, passingMarks, questions }) {
    // Check if exam already exists
    const existing = await prisma.exam.findFirst({ where: { title, createdById } });
    if (existing) {
      console.log(`  (skipped existing exam: ${title})`);
      return existing;
    }

    const exam = await prisma.exam.create({
      data: {
        title,
        subjectId,
        createdById,
        duration,
        totalMarks,
        passingMarks,
        isPublished: true,
        showAnswersAfter: true,
        maxViolations: 3,
      },
    });

    for (let qi = 0; qi < questions.length; qi++) {
      const [text, options, correctIndex] = questions[qi];
      await prisma.question.create({
        data: {
          examId: exam.id,
          text,
          order: qi,
          marks: 1,
          options: {
            create: options.map((optText, oi) => ({
              text: optText,
              isCorrect: oi === correctIndex,
              order: oi,
            })),
          },
        },
      });
    }
    return exam;
  }

  // Exam 1: JavaScript Fundamentals
  await createExam({
    title: 'JavaScript Fundamentals',
    subjectId: progSubject.id,
    createdById: faculty1.id,
    duration: 15,
    totalMarks: 10,
    passingMarks: 6,
    questions: [
      ['Which keyword declares a constant in JavaScript?', ['var', 'let', 'const', 'static'], 2],
      ['Which method converts JSON text into an object?', ['JSON.parse()', 'JSON.object()', 'JSON.read()', 'parse.JSON()'], 0],
      ['What does === compare?', ['Only type', 'Only value', 'Value and type', 'References only'], 2],
      ['Which is an array method?', ['map()', 'loop()', 'repeat()', 'iterate()'], 0],
      ['Which symbol starts a single-line comment?', ['<!--', '//', '##', '**'], 1],
      ['What is the output of typeof null?', ['"null"', '"undefined"', '"object"', '"boolean"'], 2],
      ['Which method adds an element at the end of an array?', ['push()', 'pop()', 'shift()', 'unshift()'], 0],
      ['What does the "this" keyword refer to in an arrow function?', ['The arrow function itself', 'The enclosing lexical context', 'The global object', 'undefined'], 1],
      ['What is a closure in JavaScript?', ['A function with no parameters', 'A function that has access to its outer scope', 'A way to close a browser window', 'A method to stop a loop'], 1],
      ['Which event fires when the DOM is fully loaded?', ['onload', 'DOMContentLoaded', 'ready', 'onDOMLoad'], 1],
    ],
  });

  // Exam 2: Web Technology Basics
  await createExam({
    title: 'Web Technology Basics',
    subjectId: webSubject.id,
    createdById: faculty1.id,
    duration: 10,
    totalMarks: 8,
    passingMarks: 5,
    questions: [
      ['HTML stands for?', ['Hyper Text Markup Language', 'High Text Machine Language', 'Hyperlink Text Management Language', 'Home Tool Markup Language'], 0],
      ['Which CSS property changes text color?', ['font', 'text-color', 'color', 'foreground'], 2],
      ['Which HTML tag creates a hyperlink?', ['<link>', '<a>', '<href>', '<url>'], 1],
      ['CSS is mainly used for?', ['Database storage', 'Presentation and style', 'Server hosting', 'Compilation'], 1],
      ['Which protocol is used for secure web traffic?', ['HTTP', 'FTP', 'HTTPS', 'SMTP'], 2],
      ['What does the <meta charset="utf-8"> tag do?', ['Sets page title', 'Specifies character encoding', 'Links CSS file', 'Adds metadata keywords'], 1],
      ['Which CSS display value makes an element a flex container?', ['block', 'inline', 'flex', 'grid'], 2],
      ['What is the correct HTML for creating a checkbox?', ['<input type="button">', '<input type="check">', '<input type="checkbox">', '<check>'], 2],
    ],
  });

  // Exam 3: Database Systems
  await createExam({
    title: 'Database Systems — Midterm',
    subjectId: dbSubject.id,
    createdById: faculty2.id,
    duration: 20,
    totalMarks: 10,
    passingMarks: 7,
    questions: [
      ['What does SQL stand for?', ['Structured Query Language', 'Simple Query Language', 'Standard Question Language', 'Sequential Query Language'], 0],
      ['Which SQL clause filters records?', ['ORDER BY', 'GROUP BY', 'WHERE', 'HAVING'], 2],
      ['A primary key must be:', ['Unique and not null', 'Unique but can be null', 'Any value', 'A foreign key'], 0],
      ['Which SQL statement is used to retrieve data?', ['INSERT', 'SELECT', 'UPDATE', 'DELETE'], 1],
      ['What is normalization?', ['Backing up data', 'Organizing data to reduce redundancy', 'Encrypting data', 'Indexing tables'], 1],
      ['A foreign key creates a relationship between:', ['Two columns in the same table', 'Two tables', 'Two databases', 'Two views'], 1],
      ['Which JOIN returns all rows from both tables?', ['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL OUTER JOIN'], 3],
      ['What is a transaction in a database?', ['A backup operation', 'A sequence of operations treated as a unit', 'A type of index', 'A stored procedure'], 1],
      ['ACID stands for:', ['Atomicity, Consistency, Isolation, Durability', 'Availability, Consistency, Isolation, Data', 'Atomicity, Concurrency, Integrity, Durability', 'Access, Control, Integrity, Data'], 0],
      ['Which SQL command removes all rows from a table without deleting the table?', ['DROP', 'DELETE', 'TRUNCATE', 'REMOVE'], 2],
    ],
  });

  console.log('✓ 3 exams with questions created\n');
  console.log('─────────────────────────────────────────');
  console.log('✅ Seed complete!\n');
  console.log('Test accounts:');
  console.log(`  Admin:   ${adminEmail} / ${adminPw}`);
  console.log('  Faculty: faculty1@scorex.local / Faculty@123');
  console.log('  Faculty: faculty2@scorex.local / Faculty@123');
  console.log('  Student: student1@scorex.local / Student@123');
  console.log('  Student: student2@scorex.local / Student@123');
  console.log('  Student: student3@scorex.local / Student@123');
}

main()
  .catch(e => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
