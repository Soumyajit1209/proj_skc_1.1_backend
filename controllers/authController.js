const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const pool = require('../config/db');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const transporter = nodemailer.createTransport({
  host: 'smtp.ethereal.email',
  port: 587,
  auth: {
    user: process.env.SMTP_USER || 'your_smtp_user',
    pass: process.env.SMTP_PASS || 'your_smtp_password',
  },
});

const superadminLogin = async (req, res) => {
  const { username, password, role } = req.body;

  // Validate required fields
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Missing username, password, or role in request body' });
  }

  if (role !== 'superadmin') {
    return res.status(400).json({ error: 'Superadmin login requires role to be superadmin' });
  }

  try {
    // Fetch user from superadmin table
    const [rows] = await pool.query('SELECT * FROM superadmin WHERE username = ?', [username]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid username' });
    }

    // Validate password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, role: 'superadmin' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({
      token,
      role: 'superadmin',
      user: {
        id: user.id,
        username: user.username,
      },
    });
  } catch (error) {
    console.error('Superadmin login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const login = async (req, res) => {
  if (!req.body || !req.body.username || !req.body.password || !req.body.role || !req.body.branch_name) {
    return res.status(400).json({ error: 'Missing username, password, role, or branch_name in request body' });
  }

  const { username, password, role, branch_name } = req.body;

  try {
    const table = role === 'admin' ? 'admin' : 'employee_master';
    const idField = role === 'admin' ? 'id' : 'emp_id';
    const fields = role === 'admin'
      ? 'id, username, password, branch_id'
      : 'emp_id, full_name, phone_no, email_id, aadhaar_no, profile_picture, username, password, branch_id, is_active, created_at, updated_at';

    // Branch validation (required for admin and employee)
    const [branches] = await pool.query('SELECT branch_id FROM branches WHERE branch_name = ?', [branch_name]);
    if (branches.length === 0) {
      return res.status(400).json({ error: 'Invalid branch name' });
    }
    const branch_id = branches[0].branch_id;

    const [rows] = await pool.query(`SELECT ${fields} FROM ${table} WHERE username = ? AND branch_id = ?`, [username, branch_id]);
    const user = rows[0];
    if (!user) return res.status(400).json({ error: 'Invalid username or branch mismatch' });

    if (!user.password || user.password.length < 30) {
      return res.status(500).json({ error: 'Stored password is not hashed. Please reset your password.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

    if (role === 'employee' && !user.is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    const userData = { ...user };
    delete userData.password;

    const tokenPayload = {
      id: user[idField],
      role,
      branch_id: user.branch_id,
    };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '4h' });

    res.json({ token, role, user: userData });
  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const id = req.user?.id || req.employee?.id;
  const role = req.user?.role || req.employee?.role;

  if (!id || !role) {
    return res.status(400).json({ error: 'User not authenticated' });
  }

  try {
    const table = role === 'superadmin' ? 'superadmin' : (role === 'admin' ? 'admin' : 'employee_master');
    const idField = role === 'superadmin' || role === 'admin' ? 'id' : 'emp_id';
    const [rows] = await pool.query(`SELECT password FROM ${table} WHERE ${idField} = ?`, [id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const validPassword = await bcrypt.compare(oldPassword, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid old password' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(`UPDATE ${table} SET password = ? WHERE ${idField} = ?`, [hashedPassword, id]);
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error in changePassword:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const changePasswordbyEmployee = async (req, res) => {
  const { emp_id, oldPassword, newPassword, branch_name } = req.body;

  if (!emp_id || !oldPassword || !newPassword || !branch_name) {
    return res.status(400).json({ error: 'Employee ID, old password, new password, and branch_name are required' });
  }

  try {
    const [branches] = await pool.query('SELECT branch_id FROM branches WHERE branch_name = ?', [branch_name]);
    if (branches.length === 0) {
      return res.status(400).json({ error: 'Invalid branch name' });
    }
    const branch_id = branches[0].branch_id;

    const [rows] = await pool.query(
      'SELECT password, branch_id FROM employee_master WHERE emp_id = ? AND branch_id = ?',
      [emp_id, branch_id]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Employee not found in the specified branch' });

    const validPassword = await bcrypt.compare(oldPassword, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid old password' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE employee_master SET password = ? WHERE emp_id = ? AND branch_id = ?',
      [hashedPassword, emp_id, branch_id]
    );
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error in changePasswordbyEmployee:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const forgotPassword = async (req, res) => {
  const { email, role, branch_name } = req.body;

  if (!email || !role) {
    return res.status(400).json({ error: 'Email and role are required' });
  }

  if (role !== 'superadmin' && !branch_name) {
    return res.status(400).json({ error: 'Branch name is required for admin and employee' });
  }

  try {
    let table, emailField, idField, fields, branch_id;
    if (role === 'superadmin') {
      table = 'superadmin';
      emailField = 'email_id';
      idField = 'id';
      fields = 'id, email_id';
      if (branch_name) {
        return res.status(400).json({ error: 'Branch name not required for superadmin' });
      }
    } else {
      table = role === 'admin' ? 'admin' : 'employee_master';
      emailField = 'email_id';
      idField = role === 'admin' ? 'id' : 'emp_id';
      fields = role === 'admin' ? 'id, email_id, branch_id' : 'emp_id, email_id, branch_id';

      const [branches] = await pool.query('SELECT branch_id FROM branches WHERE branch_name = ?', [branch_name]);
      if (branches.length === 0) {
        return res.status(400).json({ error: 'Invalid branch name' });
      }
      branch_id = branches[0].branch_id;
    }

    const queryParams = role === 'superadmin' ? [email] : [email, branch_id];
    const [rows] = await pool.query(
      `SELECT ${idField}, ${emailField}${role !== 'superadmin' ? ', branch_id' : ''} FROM ${table} WHERE ${emailField} = ?${role !== 'superadmin' ? ' AND branch_id = ?' : ''}`,
      queryParams
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, role, otp, expires_at) VALUES (?, ?, ?, ?)',
      [user[idField], role, otp, expiresAt]
    );

    await transporter.sendMail({
      to: email,
      subject: 'Password Reset OTP',
      text: `Your OTP for password reset is: ${otp}. It is valid for 15 minutes.`,
    });

    res.json({ message: 'OTP sent to email' });
  } catch (error) {
    console.error('Error in forgotPassword:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const resetPassword = async (req, res) => {
  const { otp, newPassword, role, branch_name } = req.body;

  if (!otp || !newPassword || !role) {
    return res.status(400).json({ error: 'OTP, new password, and role are required' });
  }

  if (role !== 'superadmin' && !branch_name) {
    return res.status(400).json({ error: 'Branch name is required for admin and employee' });
  }

  try {
    let branch_id;
    if (role !== 'superadmin') {
      const [branches] = await pool.query('SELECT branch_id FROM branches WHERE branch_name = ?', [branch_name]);
      if (branches.length === 0) {
        return res.status(400).json({ error: 'Invalid branch name' });
      }
      branch_id = branches[0].branch_id;
    }

    const [rows] = await pool.query(
      'SELECT * FROM password_reset_tokens WHERE otp = ? AND role = ? AND expires_at > NOW()',
      [otp, role]
    );
    const resetRecord = rows[0];
    if (!resetRecord) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const table = role === 'superadmin' ? 'superadmin' : (role === 'admin' ? 'admin' : 'employee_master');
    const idField = role === 'superadmin' || role === 'admin' ? 'id' : 'emp_id';
    const queryParams = role === 'superadmin' ? [resetRecord.user_id] : [resetRecord.user_id, branch_id];
    const [userRows] = await pool.query(
      `SELECT branch_id FROM ${table} WHERE ${idField} = ?${role !== 'superadmin' ? ' AND branch_id = ?' : ''}`,
      queryParams
    );
    const user = userRows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(`UPDATE ${table} SET password = ? WHERE ${idField} = ?`, [hashedPassword, resetRecord.user_id]);
    await pool.query('DELETE FROM password_reset_tokens WHERE otp = ?', [otp]);
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error in resetPassword:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

module.exports = { superadminLogin, login, changePassword, forgotPassword, resetPassword, changePasswordbyEmployee };