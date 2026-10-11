const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const JWT_EXPIRES = '24h';
const COOKIE_NAME = 'scorex_token';

/**
 * Sign a JWT for a user
 */
function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

/**
 * Set the JWT as an httpOnly cookie
 */
function setCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: process.env.COOKIE_SAME_SITE || 'Strict',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });
}

/**
 * Clear the auth cookie
 */
function clearCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: process.env.COOKIE_SAME_SITE || 'Strict',
  });
}

/**
 * Middleware: verify JWT from cookie, attach req.user
 */
async function verifyToken(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated. Please log in.' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Re-fetch user to ensure they're still active
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, name: true, uid: true, email: true, role: true, isActive: true },
    });
    if (!user) {
      clearCookie(res);
      return res.status(401).json({ error: 'User not found.' });
    }
    if (!user.isActive) {
      clearCookie(res);
      return res.status(403).json({ error: 'Account is deactivated. Contact admin.' });
    }
    req.user = user;
    next();
  } catch (err) {
    clearCookie(res);
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
}

/**
 * Middleware factory: require specific roles
 * Usage: requireRole('admin') or requireRole('faculty', 'admin')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
    }
    next();
  };
}

/**
 * Helper: write an audit log entry
 */
async function auditLog(userId, action, entity, entityId, metadata, ipAddress) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        entity: entity || null,
        entityId: entityId || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ipAddress: ipAddress || null,
      },
    });
  } catch (e) {
    // Non-fatal — don't crash the request
    console.error('[AuditLog error]', e.message);
  }
}

module.exports = { signToken, setCookie, clearCookie, verifyToken, requireRole, auditLog };
