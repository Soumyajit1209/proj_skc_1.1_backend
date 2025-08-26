const pool = require('../config/db');
const bcrypt = require('bcryptjs');

const addBranch = async (req, res) => {
  const { branch_name } = req.body;

  if (!req.user.is_superadmin) {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  if (!branch_name) {
    return res.status(400).json({ error: 'Branch name is required' });
  }

  try {
    const [existing] = await pool.query('SELECT branch_id FROM branches WHERE branch_name = ?', [branch_name]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Branch name already exists' });
    }

    const [result] = await pool.query('INSERT INTO branches (branch_name) VALUES (?)', [branch_name]);
    res.status(201).json({ branch_id: result.insertId, message: 'Branch added successfully' });
  } catch (error) {
    console.error('Add branch error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const addAdminToBranch = async (req, res) => {
  const { username, password, email_id, branch_id } = req.body;

  if (!req.user.is_superadmin) {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  if (!username || !password || !branch_id) {
    return res.status(400).json({ error: 'Username, password, and branch_id are required' });
  }

  try {
    const [branchCheck] = await pool.query('SELECT branch_id FROM branches WHERE branch_id = ?', [branch_id]);
    if (branchCheck.length === 0) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    const [adminCheck] = await pool.query('SELECT id FROM admin WHERE branch_id = ?', [branch_id]);
    if (adminCheck.length > 0) {
      return res.status(400).json({ error: 'Branch already has an admin' });
    }

    const [usernameCheck] = await pool.query('SELECT id FROM admin WHERE username = ?', [username]);
    if (usernameCheck.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO admin (username, password, email_id, branch_id, is_superadmin) VALUES (?, ?, ?, ?, 0)',
      [username, hashedPassword, email_id || null, branch_id]
    );

    res.status(201).json({ id: result.insertId, message: 'Admin added to branch successfully' });
  } catch (error) {
    console.error('Add admin to branch error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

module.exports = { addBranch, addAdminToBranch };