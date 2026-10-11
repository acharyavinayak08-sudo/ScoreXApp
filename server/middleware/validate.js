const { validationResult } = require('express-validator');

/**
 * Middleware: run after express-validator rules.
 * If there are validation errors, respond 422 with the list.
 */
function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      error: 'Validation failed',
      details: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

module.exports = { validateRequest };
