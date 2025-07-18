const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = "acb6ebcf5cd7b331a5e3b7ea4397c3b1ee1367bfc924102f8dc5f191f213ee19dc2cae4dc2d7f4338aa0f441df483fb3bbcea9b4248b70489a9078f6acb218cc";

const resetEmployee = (req, res, next) => {
  req.employee = null;
  next();
};

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && !authHeader.startsWith('Bearer ')) {
    return res.status(400).json({ error: 'Invalid Authorization header format. Use Bearer token' });
  }
  const token = authHeader && authHeader.split(' ')[1];
  const cookieToken = req.cookies?.token;
  const tokenToVerify = cookieToken || token;

  if (!tokenToVerify) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const user = await new Promise((resolve, reject) => {
      jwt.verify(tokenToVerify, JWT_SECRET, (err, decoded) => (err ? reject(err) : resolve(decoded)));
    });
    req.user = user;
    next();
  } catch (err) {
    console.error('Token verification error:', err.message);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

const validateEmpId = (req, res, next) => {
  let emp_id;
  if (req.method === 'GET') {
    emp_id = req.query.emp_id; // Extract from query params for GET
  } else {
    emp_id = req.body.emp_id; // Extract from body for POST
  }

  console.log('validateEmpId - emp_id:', emp_id, 'method:', req.method, 'url:', req.originalUrl);

  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  const empIdNum = parseInt(emp_id);
  if (isNaN(empIdNum)) {
    return res.status(400).json({ error: 'Employee ID must be a valid number' });
  }

  req.employee = { id: empIdNum };
  next();
};
const restrictTo = (...roles) => {
  return (req, res, next) => {
    const userRole = req.user?.role || req.employee?.role;
    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
};

module.exports = { resetEmployee, authenticateToken, validateEmpId, restrictTo };