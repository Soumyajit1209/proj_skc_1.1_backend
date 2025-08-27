const pool = require('../config/db');
const bcrypt = require('bcryptjs');




const getAllAdmins = async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  try {
    const [rows] = await pool.query(`
      SELECT 
        a.id, 
        a.username, 
        a.email_id, 
        a.branch_id, 
        b.branch_name,
        a.created_at,
        a.updated_at
      FROM admin a 
      LEFT JOIN branches b ON a.branch_id = b.branch_id 
      ORDER BY a.created_at DESC
    `);
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const getSystemStats = async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  try {
    // Get total branches
    const [branchCount] = await pool.query('SELECT COUNT(*) as count FROM branches');
    
    // Get total admins
    const [adminCount] = await pool.query('SELECT COUNT(*) as count FROM admin');
    
    // Get total employees across all branches
    const [employeeCount] = await pool.query('SELECT COUNT(*) as count FROM employee_master');
    
    // Get active employees (assuming is_active = 1 means active)
    const [activeEmployees] = await pool.query('SELECT COUNT(*) as count FROM employee_master WHERE is_active = 1');

    const stats = {
      totalBranches: branchCount[0].count,
      totalAdmins: adminCount[0].count,
      totalEmployees: employeeCount[0].count,
      activeUsers: activeEmployees[0].count
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching system stats:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const deleteBranch = async (req, res) => {
  const { branch_id } = req.params;

  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  try {
    // Check if branch exists
    const [branchExists] = await pool.query('SELECT branch_id FROM branches WHERE branch_id = ?', [branch_id]);
    if (branchExists.length === 0) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    // Check if branch has any employees
    const [employeeCount] = await pool.query('SELECT COUNT(*) as count FROM employee_master WHERE branch_id = ?', [branch_id]);
    if (employeeCount[0].count > 0) {
      return res.status(400).json({ error: 'Cannot delete branch with existing employees' });
    }

    // Check if branch has an admin
    const [adminCount] = await pool.query('SELECT COUNT(*) as count FROM admin WHERE branch_id = ?', [branch_id]);
    if (adminCount[0].count > 0) {
      return res.status(400).json({ error: 'Cannot delete branch with assigned admin. Remove admin first.' });
    }

    // Delete the branch
    const [result] = await pool.query('DELETE FROM branches WHERE branch_id = ?', [branch_id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    res.json({ message: 'Branch deleted successfully' });
  } catch (error) {
    console.error('Error deleting branch:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const deleteAdmin = async (req, res) => {
  const { admin_id } = req.params;

  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  try {
    // Check if admin exists
    const [adminExists] = await pool.query('SELECT id FROM admin WHERE id = ?', [admin_id]);
    if (adminExists.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // Delete the admin
    const [result] = await pool.query('DELETE FROM admin WHERE id = ?', [admin_id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json({ message: 'Admin deleted successfully' });
  } catch (error) {
    console.error('Error deleting admin:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};


const addBranch = async (req, res) => {
  const { branch_name } = req.body;

  if (req.user.role !== 'superadmin') {
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

  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  if (!username || !password || !branch_id) {
    return res.status(400).json({ error: 'Username, password, and branch_id are required' });
  }

  try {
    // Check if branch exists
    const [branchCheck] = await pool.query('SELECT branch_id, branch_name FROM branches WHERE branch_id = ?', [branch_id]);
    if (branchCheck.length === 0) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    // Check if branch already has an admin
    const [adminCheck] = await pool.query('SELECT id FROM admin WHERE branch_id = ?', [branch_id]);
    if (adminCheck.length > 0) {
      return res.status(400).json({ error: 'Branch already has an admin assigned' });
    }

    // Check if username already exists
    const [usernameCheck] = await pool.query('SELECT id FROM admin WHERE username = ?', [username]);
    if (usernameCheck.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password and create admin
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO admin (username, password, email_id, branch_id) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, email_id || null, branch_id]
    );

    res.status(201).json({ 
      id: result.insertId, 
      message: `Admin added to ${branchCheck[0].branch_name} successfully` 
    });
  } catch (error) {
    console.error('Error adding admin to branch:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const addSuperadmin = async (req, res) => {
  const { username, password, email_id } = req.body;

  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  try {
    // Check if superadmin already exists
    const [existing] = await pool.query('SELECT id FROM superadmin WHERE id = 1');
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Superadmin already exists. Only one superadmin is allowed.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO superadmin (id, username, password, email_id) VALUES (1, ?, ?, ?)',
      [username, hashedPassword, email_id || null]
    );

    res.status(201).json({ id: result.insertId, message: 'Superadmin created successfully' });
  } catch (error) {
    console.error('Add superadmin error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const getBranchesWithInfo = async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  try {
    const [rows] = await pool.query(`
      SELECT 
        b.branch_id,
        b.branch_name,
        b.created_at,
        b.updated_at,
        COUNT(DISTINCT e.emp_id) as employee_count,
        a.username as admin_username,
        a.id as admin_id
      FROM branches b
      LEFT JOIN employee_master e ON b.branch_id = e.branch_id
      LEFT JOIN admin a ON b.branch_id = a.branch_id
      GROUP BY b.branch_id, b.branch_name, b.created_at, b.updated_at, a.username, a.id
      ORDER BY b.branch_name ASC
    `);
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching branches with info:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

module.exports = { addBranch, addAdminToBranch, addSuperadmin , getAllAdmins, getSystemStats, deleteBranch, deleteAdmin, getBranchesWithInfo };