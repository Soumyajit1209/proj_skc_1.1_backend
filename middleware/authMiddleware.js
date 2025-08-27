const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

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
    const user = jwt.verify(tokenToVerify, JWT_SECRET);

    if (user.role === 'superadmin') {
      req.user = {
        id: user.id,
        role: user.role,
      };
    } else if (user.role === 'admin') {
      req.user = {
        id: user.id,
        role: user.role,
        branch_id: user.branch_id,
      };
    } else if (user.role === 'employee') {
      req.employee = {
        id: user.id,
        role: user.role,
        branch_id: user.branch_id,
      };
    } else {
      return res.status(403).json({ error: 'Invalid role in token' });
    }

    next();
  } catch (err) {
    console.error('Token verification error:', err.message);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

const validateEmpId = async (req, res, next) => {
  let emp_id;
  if (req.method === 'GET' || req.method === 'DELETE') {
    emp_id = req.query.emp_id;
  } else {
    emp_id = req.body.emp_id;
  }

  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  const empIdNum = parseInt(emp_id);
  if (isNaN(empIdNum) || empIdNum <= 0) {
    return res.status(400).json({ error: 'Employee ID must be a valid number' });
  }

  try {
    const [rows] = await pool.query('SELECT emp_id, branch_id FROM employee_master WHERE emp_id = ?', [empIdNum]);
    const employee = rows[0];
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (req.user && req.user.role !== 'superadmin' && req.user.branch_id !== employee.branch_id) {
      return res.status(403).json({ error: 'Employee does not belong to your branch' });
    }

    req.employee = { id: empIdNum, branch_id: employee.branch_id };
    next();
  } catch (error) {
    console.error('Error in validateEmpId:', error);
    return res.status(500).json({ error: 'Server error during employee validation' });
  }
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