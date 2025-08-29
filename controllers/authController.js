const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const superadminLogin = async (req, res) => {
  if (!req.body) {
    console.error('Request body is missing or invalid');
    return res.status(400).json({ error: 'Request body is missing or invalid' });
  }

  const { username, password, role } = req.body;
  console.log('Received superadmin login request:', { username, role });

  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Missing username, password, or role in request body' });
  }

  if (role !== 'superadmin') {
    return res.status(400).json({ error: 'Superadmin login requires role to be superadmin' });
  }

  try {
    console.log('Querying superadmin for username:', username);
    const [rows] = await pool.query('SELECT * FROM superadmin WHERE username = ?', [username]);
    console.log('Superadmin query result:', rows);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid username' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    console.log('Password match:', isMatch);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const tokenPayload = { id: user.id, username: user.username, role: 'superadmin' };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '4h' });
    console.log('Generated JWT:', token);

    // Verify token immediately
    try {
      jwt.verify(token, JWT_SECRET);
      console.log('Token verification successful');
    } catch (err) {
      console.error('Immediate token verification failed:', err.message);
      return res.status(500).json({ error: 'Failed to generate valid token' });
    }

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
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const login = async (req, res) => {
  console.log('Request body:', req.body);

  if (!req.body) {
    return res.status(400).json({ error: 'Request body is missing or invalid' });
  }

  let { username, password, role, branch_id, branch_name } = req.body;

  if (!username || !password || !role || (!branch_id && !branch_name)) {
    return res.status(400).json({ error: 'Missing username, password, role, or both branch_id and branch_name' });
  }

  try {
    // If branch_name is provided instead of branch_id, fetch branch_id from branch table
    if (!branch_id && branch_name) {
      console.log('Querying branch for branch_name:', branch_name);
      const [branchRows] = await pool.query('SELECT branch_id, branch_name FROM branches WHERE branch_name = ?', [branch_name]);
      console.log('Branch query result:', branchRows);
      const branch = branchRows[0];
      if (!branch) {
        return res.status(400).json({ error: 'Invalid branch_name' });
      }
      branch_id = branch.branch_id;
      branch_name = branch.branch_name; // Ensure branch_name is set
    } else {
      // Fetch branch_name if only branch_id is provided
      console.log('Querying branch for branch_id:', branch_id);
      const [branchRows] = await pool.query('SELECT branch_name FROM branches WHERE branch_id = ?', [branch_id]);
      console.log('Branch query result:', branchRows);
      const branch = branchRows[0];
      if (!branch) {
        return res.status(400).json({ error: 'Invalid branch_id' });
      }
      branch_name = branch.branch_name;
    }

    if (role === 'employee') {
      console.log('Querying employee for username:', username);
      const [rows] = await pool.query(
        'SELECT emp_id, full_name, phone_no, email_id, aadhaar_no, profile_picture, username, password, branch_id, is_active, created_at, updated_at FROM employee_master WHERE username = ? AND branch_id = ?',
        [username, branch_id]
      );
      console.log('Employee query result:', rows);
      const employee = rows[0];
      if (!employee) {
        return res.status(400).json({ error: 'Invalid username or branch_id' });
      }

      const validPassword = await bcrypt.compare(password, employee.password);
      console.log('Password match:', validPassword);
      if (!validPassword) {
        return res.status(400).json({ error: 'Invalid password' });
      }

      if (!employee.is_active) {
        return res.status(403).json({ error: 'Employee account is inactive' });
      }

      const employeeData = { ...employee, branch_name };
      delete employeeData.password;
      return res.json({ role: 'employee', user: employeeData });
    }

    const table = role === 'admin' ? 'admin' : 'employee_master';
    const idField = role === 'admin' ? 'id' : 'emp_id';
    const fields = role === 'admin'
      ? 'id, username, password, branch_id'
      : 'emp_id, full_name, phone_no, email_id, aadhaar_no, profile_picture, username, password, branch_id, is_active, created_at, updated_at';

    console.log('Querying user:', { table, username, branch_id });
    const [rows] = await pool.query(`SELECT ${fields} FROM ${table} WHERE username = ? AND branch_id = ?`, [username, branch_id]);
    console.log('User query result:', rows);
    const user = rows[0];
    if (!user) return res.status(400).json({ error: 'Invalid username or branch_id mismatch' });

    if (!user.password || user.password.length < 30) {
      return res.status(500).json({ error: 'Stored password is not hashed. Please reset your password.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

    const userData = { ...user, branch_name };
    delete userData.password;

    if (role === 'admin') {
      const token = jwt.sign({ id: user[idField], role, branch_id }, JWT_SECRET, { expiresIn: '4h' });
      res.json({ token, role, user: userData });
    } else {
      res.json({ role, user: userData });
    }
  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const changePassword = async (req, res) => {
  const { old_password, new_password } = req.body;
  const user = req.user;
  console.log('Change password request for user:', { user_id: user.id, role: user.role });

  if (!old_password || !new_password) {
    return res.status(400).json({ error: 'Old password and new password are required' });
  }

  try {
    const table = user.role === 'superadmin' ? 'superadmin' : 'admin';
    const idField = user.role === 'superadmin' ? 'id' : 'id';
    console.log('Querying user for password change:', { table, id: user.id });
    const [rows] = await pool.query(`SELECT password FROM ${table} WHERE ${idField} = ?`, [user.id]);
    console.log('User query result:', rows);
    const storedUser = rows[0];
    if (!storedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await bcrypt.compare(old_password, storedUser.password);
    console.log('Old password match:', isMatch);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid old password' });
    }

    const hashedNewPassword = await bcrypt.hash(new_password, 10);
    await pool.query(`UPDATE ${table} SET password = ? WHERE ${idField} = ?`, [hashedNewPassword, user.id]);
    console.log('Password updated for user:', user.id);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error in changePassword:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const changePasswordbyEmployee = async (req, res) => {
  const { emp_id, old_password, new_password } = req.body;
  console.log('Change password employee request:', { emp_id });

  if (!emp_id || !old_password || !new_password) {
    return res.status(400).json({ error: 'Employee ID, old password, and new password are required' });
  }

  try {
    const employee = req.employee;
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    console.log('Querying employee for emp_id:', emp_id);
    const [rows] = await pool.query('SELECT password FROM employee_master WHERE emp_id = ?', [emp_id]);
    const storedEmployee = rows[0];
    if (!storedEmployee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const isMatch = await bcrypt.compare(old_password, storedEmployee.password);
    console.log('Old password match:', isMatch);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid old password' });
    }

    const hashedNewPassword = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE employee_master SET password = ? WHERE emp_id = ?', [hashedNewPassword, emp_id]);
    console.log('Password updated for employee:', emp_id);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error in changePasswordbyEmployee:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;
  console.log('Forgot password request for email:', email);

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const resetToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1h' });
    console.log('Generated reset token:', resetToken);

    // In a real application, send resetToken via email
    res.json({ message: 'Password reset token generated', resetToken });
  } catch (error) {
    console.error('Error in forgotPassword:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const resetPassword = async (req, res) => {
  const { token, new_password } = req.body;
  console.log('Reset password request');

  if (!token || !new_password) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Decoded reset token:', decoded);

    const hashedNewPassword = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedNewPassword, decoded.id]);
    console.log('Password reset for user:', decoded.id);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error in resetPassword:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

module.exports = { login, changePassword, forgotPassword, resetPassword, changePasswordbyEmployee, superadminLogin };