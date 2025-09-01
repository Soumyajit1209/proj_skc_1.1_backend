const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// ==============================
// Multer Configuration for File Uploads (shared from admin)
// ==============================

const uploadDir = 'uploads/profile_picture';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `employee-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Please upload an image file'), false);
    }
    if (file.size > 5 * 1024 * 1024) {
      return cb(new Error('Image size should not exceed 5MB'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ==============================
// Existing Superadmin Functions
// ==============================

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
  if (!req.user || req.user.role !== 'superadmin') {
    console.error('Unauthorized access attempt:', { user: req.user });
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  try {
    // Get total branches
    const [branchCount] = await pool.query('SELECT COUNT(*) as count FROM branches');
    if (!branchCount || !branchCount[0]) {
      throw new Error('Failed to fetch branch count');
    }

    // Get total admins
    const [adminCount] = await pool.query('SELECT COUNT(*) as count FROM admin');
    if (!adminCount || !adminCount[0]) {
      throw new Error('Failed to fetch admin count');
    }

    // Get total employees across all branches
    const [employeeCount] = await pool.query('SELECT COUNT(*) as count FROM employee_master');
    if (!employeeCount || !employeeCount[0]) {
      throw new Error('Failed to fetch employee count');
    }

    // Get active employees
    const [activeEmployees] = await pool.query('SELECT COUNT(*) as count FROM employee_master WHERE is_active = 1');
    if (!activeEmployees || !activeEmployees[0]) {
      throw new Error('Failed to fetch active employee count');
    }

    // Get employees without branch allocation
    const [unallocatedEmployees] = await pool.query('SELECT COUNT(*) as count FROM employee_master WHERE branch_id IS NULL');
    if (!unallocatedEmployees || !unallocatedEmployees[0]) {
      throw new Error('Failed to fetch unallocated employee count');
    }

    const stats = {
      totalBranches: branchCount[0].count,
      totalAdmins: adminCount[0].count,
      totalEmployees: employeeCount[0].count,
      activeUsers: activeEmployees[0].count,
      unallocatedEmployees: unallocatedEmployees[0].count
    };

    console.log('System stats fetched successfully:', stats);
    res.status(200).json(stats);
  } catch (error) {
    console.error('Error fetching system stats:', {
      message: error.message,
      stack: error.stack,
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};  

const getAllEmployees = async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  try {
    const { branch_id, status, search } = req.query;
    
    let query = `
      SELECT 
        e.emp_id,
        e.full_name,
        e.phone_no,
        e.email_id,
        e.aadhaar_no,
        e.profile_picture,
        e.username,
        e.is_active,
        e.branch_id,
        e.created_at,
        e.updated_at,
        b.branch_name
      FROM employee_master e
      LEFT JOIN branches b ON e.branch_id = b.branch_id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (branch_id && branch_id !== 'all') {
      if (branch_id === 'unallocated') {
        query += ' AND e.branch_id IS NULL';
      } else {
        query += ' AND e.branch_id = ?';
        params.push(branch_id);
      }
    }
    
    if (status && status !== 'all') {
      query += ' AND e.is_active = ?';
      params.push(status === 'active' ? 1 : 0);
    }
    
    if (search) {
      query += ' AND (e.full_name LIKE ? OR e.username LIKE ? OR e.email_id LIKE ? OR e.phone_no LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    query += ' ORDER BY e.created_at DESC';
    
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching all employees:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const getEmployeesByBranch = async (req, res) => {
  const { branch_id } = req.params;
  
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  try {
    let query, params = [];
    
    if (branch_id === 'unallocated') {
      query = `
        SELECT 
          e.emp_id,
          e.full_name,
          e.phone_no,
          e.email_id,
          e.aadhaar_no,
          e.profile_picture,
          e.username,
          e.is_active,
          e.branch_id,
          e.created_at,
          e.updated_at,
          NULL as branch_name
        FROM employee_master e
        WHERE e.branch_id IS NULL
        ORDER BY e.created_at DESC
      `;
    } else {
      query = `
        SELECT 
          e.emp_id,
          e.full_name,
          e.phone_no,
          e.email_id,
          e.aadhaar_no,
          e.profile_picture,
          e.username,
          e.is_active,
          e.branch_id,
          e.created_at,
          e.updated_at,
          b.branch_name
        FROM employee_master e
        LEFT JOIN branches b ON e.branch_id = b.branch_id
        WHERE e.branch_id = ?
        ORDER BY e.created_at DESC
      `;
      params.push(branch_id);
    }
    
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching employees by branch:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const assignEmployeeToBranch = async (req, res) => {
  const { emp_id, branch_id } = req.body;
  
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  if (!emp_id || !branch_id) {
    return res.status(400).json({ error: 'Employee ID and Branch ID are required' });
  }

  try {
    // Check if employee exists
    const [employeeCheck] = await pool.query('SELECT emp_id, full_name, branch_id FROM employee_master WHERE emp_id = ?', [emp_id]);
    if (employeeCheck.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Check if branch exists
    const [branchCheck] = await pool.query('SELECT branch_id, branch_name FROM branches WHERE branch_id = ?', [branch_id]);
    if (branchCheck.length === 0) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    const employee = employeeCheck[0];
    const branch = branchCheck[0];

    // Update employee's branch
    const [result] = await pool.query('UPDATE employee_master SET branch_id = ?, updated_at = CURRENT_TIMESTAMP WHERE emp_id = ?', [branch_id, emp_id]);

    if (result.affectedRows === 0) {
      return res.status(500).json({ error: 'Failed to assign employee to branch' });
    }

    res.json({ 
      message: `Employee ${employee.full_name} successfully assigned to ${branch.branch_name}`,
      employee: employee.full_name,
      branch: branch.branch_name,
      previousBranch: employee.branch_id
    });
  } catch (error) {
    console.error('Error assigning employee to branch:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const updateEmployeeStatus = async (req, res) => {
  const { emp_id } = req.params;
  const { is_active } = req.body;
  
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: 'Status must be boolean (active/inactive)' });
  }

  try {
    // Check if employee exists
    const [employeeCheck] = await pool.query('SELECT emp_id, full_name, is_active FROM employee_master WHERE emp_id = ?', [emp_id]);
    if (employeeCheck.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = employeeCheck[0];

    // Update employee status
    const [result] = await pool.query('UPDATE employee_master SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE emp_id = ?', [is_active, emp_id]);

    if (result.affectedRows === 0) {
      return res.status(500).json({ error: 'Failed to update employee status' });
    }

    res.json({ 
      message: `Employee ${employee.full_name} status updated to ${is_active ? 'active' : 'inactive'}`,
      employee: employee.full_name,
      previousStatus: employee.is_active,
      newStatus: is_active
    });
  } catch (error) {
    console.error('Error updating employee status:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const deleteEmployee = async (req, res) => {
  const { emp_id } = req.params;
  
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  try {
    // Check if employee exists
    const [employeeCheck] = await pool.query('SELECT emp_id, full_name FROM employee_master WHERE emp_id = ?', [emp_id]);
    if (employeeCheck.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = employeeCheck[0];

    // Delete employee (cascading deletes will handle related records)
    const [result] = await pool.query('DELETE FROM employee_master WHERE emp_id = ?', [emp_id]);

    if (result.affectedRows === 0) {
      return res.status(500).json({ error: 'Failed to delete employee' });
    }

    res.json({ 
      message: `Employee ${employee.full_name} successfully deleted`,
      employee: employee.full_name
    });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const createEmployee = async (req, res) => {
  try {
    upload.single('profile_picture')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      const { full_name, phone_no, email_id, aadhaar_no, username, password, is_active, branch_id } = req.body;

      if (!full_name || !username || !password) {
        return res.status(400).json({ error: 'Full name, username, and password are required' });
      }

      try {
        if (branch_id) {
          const [branchCheck] = await pool.query('SELECT branch_id FROM branches WHERE branch_id = ?', [branch_id]);
          if (branchCheck.length === 0) {
            return res.status(404).json({ error: 'Branch not found' });
          }
        }

        const [existing] = await pool.query(
          'SELECT emp_id FROM employee_master WHERE username = ?' + (branch_id ? ' AND branch_id = ?' : ' AND branch_id IS NULL'),
          branch_id ? [username, branch_id] : [username]
        );
        if (existing.length > 0) {
          return res.status(400).json({ error: 'Username already exists in this branch (or unallocated)' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const profilePicturePath = req.file ? `/uploads/profile_picture/${req.file.filename}` : null;

        const [result] = await pool.query(
          'INSERT INTO employee_master (full_name, phone_no, email_id, aadhaar_no, username, password, profile_picture, branch_id, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            full_name,
            phone_no || null,
            email_id || null,
            aadhaar_no || null,
            username,
            hashedPassword,
            profilePicturePath,
            branch_id || null,
            is_active !== undefined ? Number(is_active) : 1,
          ]
        );

        res.status(201).json({ emp_id: result.insertId, message: 'Employee added successfully' });
      } catch (error) {
        console.error('Error adding employee:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
      }
    });
  } catch (error) {
    console.error('Unexpected error in createEmployee:', error);
    res.status(500).json({ error: 'Unexpected server error', details: error.message });
  }
};

const updateEmployee = async (req, res) => {
  try {
    upload.single('profile_picture')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      const { emp_id } = req.params;
      const { full_name, phone_no, email_id, aadhaar_no, username, password, is_active, branch_id } = req.body;

      if (!full_name || !username) {
        return res.status(400).json({ error: 'Full name and username are required' });
      }

      try {
        const [existing] = await pool.query('SELECT * FROM employee_master WHERE emp_id = ?', [emp_id]);
        if (existing.length === 0) {
          return res.status(404).json({ error: 'Employee not found' });
        }

        if (branch_id) {
          const [branchCheck] = await pool.query('SELECT branch_id FROM branches WHERE branch_id = ?', [branch_id]);
          if (branchCheck.length === 0) {
            return res.status(404).json({ error: 'Branch not found' });
          }
        }

        if (username !== existing[0].username || branch_id !== existing[0].branch_id) {
          const [usernameCheck] = await pool.query(
            'SELECT emp_id FROM employee_master WHERE username = ? AND branch_id = ? AND emp_id != ?',
            [username, branch_id || null, emp_id]
          );
          if (usernameCheck.length > 0) {
            return res.status(400).json({ error: 'Username already exists in this branch (or unallocated)' });
          }
        }

        const updateData = {
          full_name,
          phone_no: phone_no || null,
          email_id: email_id || null,
          aadhaar_no: aadhaar_no || null,
          username,
          branch_id: branch_id || null,
          is_active: is_active !== undefined ? Number(is_active) : existing[0].is_active,
        };

        if (password) {
          updateData.password = await bcrypt.hash(password, 10);
        }

        if (req.file) {
          if (existing[0].profile_picture) {
            const oldFilePath = path.join(__dirname, '..', existing[0].profile_picture);
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
            }
          }
          updateData.profile_picture = `/uploads/profile_picture/${req.file.filename}`;
        }

        await pool.query(
          'UPDATE employee_master SET full_name = ?, phone_no = ?, email_id = ?, aadhaar_no = ?, username = ?, password = ?, profile_picture = ?, branch_id = ?, is_active = ? WHERE emp_id = ?',
          [
            updateData.full_name,
            updateData.phone_no,
            updateData.email_id,
            updateData.aadhaar_no,
            updateData.username,
            updateData.password || existing[0].password,
            updateData.profile_picture || existing[0].profile_picture,
            updateData.branch_id,
            updateData.is_active,
            emp_id,
          ]
        );

        res.status(200).json({ message: 'Employee updated successfully' });
      } catch (error) {
        console.error('Error updating employee:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
      }
    });
  } catch (error) {
    console.error('Unexpected error in updateEmployee:', error);
    res.status(500).json({ error: 'Unexpected server error', details: error.message });
  }
};

const deleteBranch = async (req, res) => {
  const { branch_id } = req.params;

  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  try {
    // Check if branch exists
    const [branchExists] = await pool.query('SELECT branch_id, branch_name FROM branches WHERE branch_id = ?', [branch_id]);
    if (branchExists.length === 0) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    const branch = branchExists[0];

    // Check if branch has any employees
    const [employeeCount] = await pool.query('SELECT COUNT(*) as count FROM employee_master WHERE branch_id = ?', [branch_id]);
    if (employeeCount[0].count > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete branch with existing employees', 
        employeeCount: employeeCount[0].count,
        suggestion: 'Please reassign or remove all employees first'
      });
    }

    // Check if branch has an admin
    const [adminCount] = await pool.query('SELECT COUNT(*) as count FROM admin WHERE branch_id = ?', [branch_id]);
    if (adminCount[0].count > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete branch with assigned admin', 
        suggestion: 'Please remove admin assignment first' 
      });
    }

    // Delete the branch
    const [result] = await pool.query('DELETE FROM branches WHERE branch_id = ?', [branch_id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    res.json({ 
      message: `Branch "${branch.branch_name}" deleted successfully`,
      branch_name: branch.branch_name
    });
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
    const [adminExists] = await pool.query('SELECT a.id, a.username, b.branch_name FROM admin a LEFT JOIN branches b ON a.branch_id = b.branch_id WHERE a.id = ?', [admin_id]);
    if (adminExists.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    const admin = adminExists[0];

    // Delete the admin
    const [result] = await pool.query('DELETE FROM admin WHERE id = ?', [admin_id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json({ 
      message: `Admin "${admin.username}" deleted successfully`,
      admin_username: admin.username,
      branch_name: admin.branch_name
    });
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
    res.status(201).json({ 
      branch_id: result.insertId, 
      message: `Branch "${branch_name}" added successfully`,
      branch_name: branch_name
    });
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
      message: `Admin "${username}" added to ${branchCheck[0].branch_name} successfully`,
      admin_username: username,
      branch_name: branchCheck[0].branch_name
    });
  } catch (error) {
    console.error('Error adding admin to branch:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const addSuperadmin = async (req, res) => {
  const { username, password, email_id } = req.body;

  try {
    // Check if superadmin already exists
    const [existing] = await pool.query('SELECT id FROM admin WHERE is_superadmin = 1');
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Superadmin already exists. Only one superadmin is allowed.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO admin (username, password, email_id, is_superadmin) VALUES (?, ?, ?, 1)',
      [username, hashedPassword, email_id || null]
    );

    res.status(201).json({ 
      id: result.insertId, 
      message: 'Superadmin created successfully',
      username: username
    });
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
        COUNT(DISTINCT CASE WHEN e.is_active = 1 THEN e.emp_id END) as active_employees,
        COUNT(DISTINCT CASE WHEN e.is_active = 0 THEN e.emp_id END) as inactive_employees,
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

const getEmployeeActivityReports = async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  try {
    const { emp_id, branch_id, start_date, end_date } = req.query;
    
    let query = `
      SELECT 
        a.activity_id,
        a.activity_datetime,
        a.customer_name,
        a.remarks,
        a.latitude,
        a.longitude,
        a.location,
        e.full_name,
        e.emp_id,
        e.username,
        b.branch_name
      FROM activities a
      JOIN employee_master e ON a.emp_id = e.emp_id
      LEFT JOIN branches b ON e.branch_id = b.branch_id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (emp_id) {
      query += ' AND a.emp_id = ?';
      params.push(emp_id);
    }
    
    if (branch_id && branch_id !== 'all') {
      if (branch_id === 'unallocated') {
        query += ' AND e.branch_id IS NULL';
      } else {
        query += ' AND e.branch_id = ?';
        params.push(branch_id);
      }
    }
    
    if (start_date) {
      query += ' AND DATE(a.activity_datetime) >= ?';
      params.push(start_date);
    }
    
    if (end_date) {
      query += ' AND DATE(a.activity_datetime) <= ?';
      params.push(end_date);
    }
    
    query += ' ORDER BY a.activity_datetime DESC';
    
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching employee activity reports:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const getEmployeeAttendanceReports = async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  try {
    const { emp_id, branch_id, start_date, end_date, status } = req.query;
    
    let query = `
      SELECT 
        ar.attendance_id,
        ar.attendance_date,
        ar.in_time,
        ar.out_time,
        ar.in_location,
        ar.out_location,
        ar.in_status,
        ar.remarks,
        e.full_name,
        e.emp_id,
        e.username,
        b.branch_name,
        TIMEDIFF(ar.out_time, ar.in_time) as work_duration
      FROM attendance_register ar
      JOIN employee_master e ON ar.emp_id = e.emp_id
      LEFT JOIN branches b ON e.branch_id = b.branch_id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (emp_id) {
      query += ' AND ar.emp_id = ?';
      params.push(emp_id);
    }
    
    if (branch_id && branch_id !== 'all') {
      if (branch_id === 'unallocated') {
        query += ' AND e.branch_id IS NULL';
      } else {
        query += ' AND e.branch_id = ?';
        params.push(branch_id);
      }
    }
    
    if (start_date) {
      query += ' AND ar.attendance_date >= ?';
      params.push(start_date);
    }
    
    if (end_date) {
      query += ' AND ar.attendance_date <= ?';
      params.push(end_date);
    }
    
    if (status && status !== 'all') {
      query += ' AND ar.in_status = ?';
      params.push(status.toUpperCase());
    }
    
    query += ' ORDER BY ar.attendance_date DESC, ar.in_time DESC';
    
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching employee attendance reports:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const resetEmployeePassword = async (req, res) => {
  const { emp_id } = req.params;
  const { new_password } = req.body;
  
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  if (!new_password) {
    return res.status(400).json({ error: 'New password is required' });
  }

  try {
    // Check if employee exists
    const [employeeCheck] = await pool.query('SELECT emp_id, full_name, username FROM employee_master WHERE emp_id = ?', [emp_id]);
    if (employeeCheck.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = employeeCheck[0];

    // Hash new password
    const hashedPassword = await bcrypt.hash(new_password, 10);

    // Update password
    const [result] = await pool.query('UPDATE employee_master SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE emp_id = ?', [hashedPassword, emp_id]);

    if (result.affectedRows === 0) {
      return res.status(500).json({ error: 'Failed to reset password' });
    }

    res.json({ 
      message: `Password reset successfully for ${employee.full_name}`,
      employee: employee.full_name,
      username: employee.username
    });
  } catch (error) {
    console.error('Error resetting employee password:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

// ==============================
// Added Attendance Management for Superadmin (global or per branch)
// ==============================

const getDailyAttendanceAll = async (req, res) => {
  try {
    const { branch_id, date, status = 'APPROVED' } = req.query; // Default status to APPROVED
    console.log('Fetching daily attendance with:', { branch_id, date, status });

    // Validate date format (YYYY-MM-DD)
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // Validate status
    const validStatuses = ['APPROVED', 'REJECTED', 'PENDING', 'all'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Use APPROVED, REJECTED, PENDING, or all' });
    }

    let query = `
      SELECT ar.*, em.full_name, em.username, b.branch_name 
      FROM attendance_register ar 
      JOIN employee_master em ON ar.emp_id = em.emp_id 
      LEFT JOIN branches b ON em.branch_id = b.branch_id 
      WHERE 1=1
    `;
    let params = [];

    if (branch_id && branch_id !== 'all') {
      query += ' AND em.branch_id = ?';
      params.push(branch_id);
    }

    if (date) {
      query += ' AND DATE(ar.attendance_date) = ?';
      params.push(date);
    } else {
      query += ' AND DATE(ar.attendance_date) = CURDATE()';
    }

    if (status !== 'all') {
      query += ' AND ar.in_status = ?';
      params.push(status);
    }

    // Add limit for performance
    query += ' LIMIT 100';

    const [rows] = await pool.query(query, params);
    console.log('Attendance records fetched:', rows.length);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching daily attendance:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const rejectAttendance = async (req, res) => {
  const { attendance_id } = req.params;
  const { remarks } = req.body;

  try {
    const [result] = await pool.query(
      'UPDATE attendance_register SET in_status = ?, remarks = ? WHERE attendance_id = ?',
      ['REJECTED', remarks, attendance_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Attendance not found' });
    }

    res.json({ message: 'Attendance rejected' });
  } catch (error) {
    console.error('Error rejecting attendance:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const closeAttendance = async (req, res) => {
  const { attendance_id } = req.params;
  console.log('Close attendance called with ID:', attendance_id);
  const { remarks } = req.body;

  try {
    // Check if attendance record exists and get employee details
    const [attendanceRecord] = await pool.query(
      'SELECT ar.*, em.branch_id, em.full_name FROM attendance_register ar JOIN employee_master em ON ar.emp_id = em.emp_id WHERE ar.attendance_id = ?',
      [attendance_id]
    );

    if (attendanceRecord.length === 0) {
      return res.status(404).json({ error: 'Attendance not found' });
    }

    // Set remarks to ADMIN_VERIFIED
    const finalRemarks = remarks || 'ADMIN_VERIFIED';

    // Update attendance record with ADMIN_VERIFIED in remarks (no status change)
    const [result] = await pool.query(
      'UPDATE attendance_register SET remarks = ? WHERE attendance_id = ?',
      [finalRemarks, attendance_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Failed to update attendance record' });
    }

    // Log the action for audit purposes
    console.log(`Superadmin ${req.user.id} updated attendance ${attendance_id} for employee ${attendanceRecord[0].emp_id} (${attendanceRecord[0].full_name}) with remarks: ${finalRemarks}`);

    res.json({ 
      message: 'Attendance verified successfully',
      details: {
        employee_id: attendanceRecord[0].emp_id,
        employee_name: attendanceRecord[0].full_name,
        attendance_date: attendanceRecord[0].attendance_date,
        verified_by: req.user.username || req.user.id,
        verified_at: new Date().toISOString(),
        verification_status: 'ADMIN_VERIFIED'
      }
    });

  } catch (error) {
    console.error('Error verifying attendance:', error);
    res.status(500).json({ 
      error: 'Server error', 
      details: error.message,
      message: 'Failed to verify attendance. Please try again.'
    });
  }
};

const getPendingOutAttendances = async (req, res) => {
  try {
    let query = 'SELECT ar.*, em.full_name, b.branch_name FROM attendance_register ar JOIN employee_master em ON ar.emp_id = em.emp_id LEFT JOIN branches b ON em.branch_id = b.branch_id ' +
                'WHERE ar.attendance_date < CURDATE() AND ar.in_time IS NOT NULL AND ar.out_time IS NULL AND ar.in_status = "APPROVED" ' +
                'AND (ar.remarks IS NULL OR ar.remarks NOT LIKE "%ADMIN_VERIFIED%")';
    let params = [];

    const { branch_id } = req.query;
    if (branch_id) {
      query += ' AND em.branch_id = ?';
      params.push(branch_id);
    }

    query += ' ORDER BY ar.attendance_date DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching pending out attendances:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const getMonthlyAttendance = async (req, res) => {
  const { month, year, branch_id } = req.query;

  if (!month || !year) {
    return res.status(400).json({ error: 'Month and year are required' });
  }

  try {
    let query = 'SELECT ar.*, em.full_name, b.branch_name FROM attendance_register ar JOIN employee_master em ON ar.emp_id = em.emp_id LEFT JOIN branches b ON em.branch_id = b.branch_id WHERE MONTH(ar.attendance_date) = ? AND YEAR(ar.attendance_date) = ?';
    let params = [month, year];

    if (branch_id) {
      query += ' AND em.branch_id = ?';
      params.push(branch_id);
    }

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching monthly attendance:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const downloadDailyAttendance = async (req, res) => {
  const { branch_id } = req.query;

  try {
    let query = 'SELECT ar.*, em.full_name FROM attendance_register ar JOIN employee_master em ON ar.emp_id = em.emp_id WHERE ar.attendance_date = CURDATE()';
    let params = [];

    if (branch_id) {
      query += ' AND em.branch_id = ?';
      params.push(branch_id);
    }

    const [rows] = await pool.query(query, params);

    const data = rows.map(row => ({
      'Employee ID': row.emp_id,
      'Full Name': row.full_name,
      'Date': row.attendance_date,
      'In Time': row.in_time || '',
      'Out Time': row.out_time || '',
      'In Location': row.in_location || '',
      'In Latitude': row.in_latitude || '',
      'In Longitude': row.in_longitude || '',
      'In Picture': row.in_picture || '',
      'Out Location': row.out_location || '',
      'Out Latitude': row.out_latitude || '',
      'Out Longitude': row.out_longitude || '',
      'Out Picture': row.out_picture || '',
      'Status': row.in_status,
      'Remarks': row.remarks || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Attendance');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Disposition', 'attachment; filename=daily_attendance.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (error) {
    console.error('Error downloading daily attendance:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const downloadAttendanceByRange = async (req, res) => {
  const { from_date, to_date, branch_id } = req.query;

  if (!from_date || !to_date) {
    return res.status(400).json({ error: 'From date and to date are required' });
  }

  try {
    let query = 'SELECT ar.*, em.full_name FROM attendance_register ar JOIN employee_master em ON ar.emp_id = em.emp_id WHERE ar.attendance_date BETWEEN ? AND ?';
    let params = [from_date, to_date];

    if (branch_id) {
      query += ' AND em.branch_id = ?';
      params.push(branch_id);
    }

    const [rows] = await pool.query(query, params);

    const data = rows.map(row => ({
      'Employee ID': row.emp_id,
      'Full Name': row.full_name,
      'Date': row.attendance_date,
      'In Time': row.in_time || '',
      'Out Time': row.out_time || '',
      'In Location': row.in_location || '',
      'In Latitude': row.in_latitude || '',
      'In Longitude': row.in_longitude || '',
      'In Picture': row.in_picture || '',
      'Out Location': row.out_location || '',
      'Out Latitude': row.out_latitude || '',
      'Out Longitude': row.out_longitude || '',
      'Out Picture': row.out_picture || '',
      'Status': row.in_status,
      'Remarks': row.remarks || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance Range');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Disposition', `attachment; filename=attendance_${from_date}_to_${to_date}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (error) {
    console.error('Error downloading attendance range:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const getEmployeeAttendanceReport = async (req, res) => {
  const { emp_id } = req.params;
  const { from_date, to_date } = req.query;

  if (!from_date || !to_date) {
    return res.status(400).json({ error: 'From date and to date are required' });
  }

  try {
    const [employee] = await pool.query(
      'SELECT emp_id, full_name, branch_id FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );
    if (!employee.length) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const [attendanceRows] = await pool.query(
      'SELECT ar.*, em.full_name FROM attendance_register ar JOIN employee_master em ON ar.emp_id = em.emp_id WHERE ar.emp_id = ? AND ar.attendance_date BETWEEN ? AND ?',
      [emp_id, from_date, to_date]
    );

    const startDate = new Date(from_date);
    const endDate = new Date(to_date);
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const presentDays = attendanceRows.filter(row => row.in_time).length;
    const absentDays = totalDays - presentDays;

    res.json({
      employee: employee[0],
      attendance: attendanceRows,
      summary: {
        totalDays,
        presentDays,
        absentDays
      }
    });
  } catch (error) {
    console.error('Error fetching employee attendance report:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

// ==============================
// Added Leave Management for Superadmin (global or per branch)
// ==============================

const getAllLeaveApplications = async (req, res) => {
  try {
    let query = 'SELECT la.*, em.full_name, a.username AS approved_by_username, b.branch_name ' +
      'FROM leave_applications la ' +
      'JOIN employee_master em ON la.emp_id = em.emp_id ' +
      'LEFT JOIN admin a ON la.approved_by = a.id ' +
      'LEFT JOIN branches b ON em.branch_id = b.branch_id';
    let params = [];

    const { branch_id } = req.query;
    if (branch_id) {
      query += ' WHERE em.branch_id = ?';
      params.push(branch_id);
    }

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching all leave applications:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const getEmployeeLeaveApplications = async (req, res) => {
  const { emp_id } = req.params;

  try {
    const [employee] = await pool.query('SELECT branch_id FROM employee_master WHERE emp_id = ?', [emp_id]);
    if (employee.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const [rows] = await pool.query(
      'SELECT la.*, em.full_name, a.username AS approved_by_username, b.branch_name ' +
      'FROM leave_applications la ' +
      'JOIN employee_master em ON la.emp_id = em.emp_id ' +
      'LEFT JOIN admin a ON la.approved_by = a.id ' +
      'LEFT JOIN branches b ON em.branch_id = b.branch_id ' +
      'WHERE la.emp_id = ?',
      [emp_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No leave applications found for this employee' });
    }

    res.json(rows);
  } catch (error) {
    console.error('Error fetching employee leave applications:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const updateLeaveStatus = async (req, res) => {
  const { leave_id } = req.params;
  const { status } = req.body;

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be APPROVED or REJECTED' });
  }

  try {
    const [leaveRows] = await pool.query(
      'SELECT la.leave_id, la.emp_id, em.branch_id FROM leave_applications la JOIN employee_master em ON la.emp_id = em.emp_id WHERE la.leave_id = ?',
      [leave_id]
    );
    if (leaveRows.length === 0) {
      return res.status(404).json({ error: 'Leave application not found' });
    }

    const [result] = await pool.query(
      'UPDATE leave_applications SET status = ?, approved_by = ?, approved_on = CURRENT_TIMESTAMP WHERE leave_id = ?',
      [status, req.user.id, leave_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Leave application not found' });
    }

    res.json({ message: `Leave application ${status.toLowerCase()} successfully` });
  } catch (error) {
    console.error('Error updating leave status:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const deleteLeaveApplication = async (req, res) => {
  const { leave_id } = req.params;

  try {
    const [leaveRows] = await pool.query(
      'SELECT la.leave_id, em.branch_id FROM leave_applications la JOIN employee_master em ON la.emp_id = em.emp_id WHERE la.leave_id = ?',
      [leave_id]
    );
    if (leaveRows.length === 0) {
      return res.status(404).json({ error: 'Leave application not found' });
    }

    const [result] = await pool.query('DELETE FROM leave_applications WHERE leave_id = ?', [leave_id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Leave application not found' });
    }

    res.status(200).json({ message: 'Leave application deleted successfully' });
  } catch (error) {
    console.error('Error deleting leave application:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const downloadLeaveApplications = async (req, res) => {
  const { status, fromDate, toDate, from_date, to_date, branch_id } = req.query;

  try {
    let query = 
      'SELECT la.*, em.full_name, a.username AS approved_by_username ' +
      'FROM leave_applications la ' +
      'JOIN employee_master em ON la.emp_id = em.emp_id ' +
      'LEFT JOIN admin a ON la.approved_by = a.id';
    
    let params = [];
    let whereConditions = [];

    if (status && status !== 'ALL') {
      whereConditions.push('la.status = ?');
      params.push(status);
    }

    const startDate = fromDate || from_date;
    const endDate = toDate || to_date;

    if (startDate && endDate) {
      whereConditions.push('DATE(la.application_datetime) BETWEEN ? AND ?');
      params.push(startDate, endDate);
    } else if (startDate) {
      whereConditions.push('DATE(la.application_datetime) >= ?');
      params.push(startDate);
    } else if (endDate) {
      whereConditions.push('DATE(la.application_datetime) <= ?');
      params.push(endDate);
    }

    if (branch_id) {
      whereConditions.push('em.branch_id = ?');
      params.push(branch_id);
    }

    if (whereConditions.length > 0) {
      query += ' WHERE ' + whereConditions.join(' AND ');
    }

    query += ' ORDER BY la.application_datetime DESC';

    const [rows] = await pool.query(query, params);

    const data = rows.map(row => ({
      'Leave ID': row.leave_id,
      'Employee ID': row.emp_id,
      'Full Name': row.full_name,
      'Application Date': row.application_datetime,
      'Start Date': row.start_date,
      'End Date': row.end_date,
      'Total Days': row.total_days,
      'Leave Type': row.leave_type,
      'Reason': row.reason || '',
      'Attachment': row.leave_attachment || '',
      'Status': row.status,
      'Approved By': row.approved_by_username || '',
      'Approved On': row.approved_on || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leave Applications');

    if (status || startDate || endDate) {
      const filterInfo = [];
      if (status && status !== 'ALL') {
        filterInfo.push({ 'Filter Applied': 'Status', 'Value': status });
      }
      if (startDate) {
        filterInfo.push({ 'Filter Applied': 'From Date', 'Value': startDate });
      }
      if (endDate) {
        filterInfo.push({ 'Filter Applied': 'To Date', 'Value': endDate });
      }
      const filterWs = XLSX.utils.json_to_sheet(filterInfo);
      XLSX.utils.book_append_sheet(wb, filterWs, 'Filter Info');
    }

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    let filename = 'leave_applications';
    if (status && status !== 'ALL') {
      filename += `_${status.toLowerCase()}`;
    }
    if (startDate || endDate) {
      filename += '_filtered';
      if (startDate) {
        filename += `_from_${startDate}`;
      }
      if (endDate) {
        filename += `_to_${endDate}`;
      }
    }
    filename += '.xlsx';

    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (error) {
    console.error('Error downloading leave applications:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

// ==============================
// Added Activity Management for Superadmin (global or per branch)
// ==============================

const getActivityReports = async (req, res) => {
  const { date, branch_id } = req.query;

  try {
    let query = 'SELECT a.*, em.full_name, b.branch_name FROM activities a JOIN employee_master em ON a.emp_id = em.emp_id LEFT JOIN branches b ON em.branch_id = b.branch_id';
    let params = [];

    if (branch_id) {
      query += ' WHERE em.branch_id = ?';
      params.push(branch_id);
      if (date) {
        query += ' AND DATE(a.activity_datetime) = ?';
        params.push(date);
      }
    } else if (date) {
      query += ' WHERE DATE(a.activity_datetime) = ?';
      params.push(date);
    }

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching activity reports:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const downloadActivityReports = async (req, res) => {
  const { from_date, to_date, branch_id } = req.query;

  try {
    let query = 'SELECT a.*, em.full_name FROM activities a JOIN employee_master em ON a.emp_id = em.emp_id';
    let params = [];
    let filename = 'activity_reports';

    if (branch_id) {
      query += ' WHERE em.branch_id = ?';
      params.push(branch_id);
    }

    if (from_date && to_date) {
      query += (params.length > 0 ? ' AND' : ' WHERE') + ' DATE(a.activity_datetime) BETWEEN ? AND ?';
      params.push(from_date, to_date);
      filename += `_from_${from_date}_to_${to_date}`;
    } else if (from_date) {
      query += (params.length > 0 ? ' AND' : ' WHERE') + ' DATE(a.activity_datetime) >= ?';
      params.push(from_date);
      filename += `_from_${from_date}`;
    } else if (to_date) {
      query += (params.length > 0 ? ' AND' : ' WHERE') + ' DATE(a.activity_datetime) <= ?';
      params.push(to_date);
      filename += `_to_${to_date}`;
    }

    query += ' ORDER BY a.activity_datetime DESC';

    const [rows] = await pool.query(query, params);

    const data = rows.map(row => ({
      'Activity ID': row.activity_id,
      'Employee ID': row.emp_id,
      'Full Name': row.full_name,
      'Activity DateTime': row.activity_datetime,
      'Customer Name': row.customer_name || '',
      'Remarks': row.remarks || '',
      'Location': row.location || '',
      'Latitude': row.latitude || '',
      'Longitude': row.longitude || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Activity Reports');

    if (from_date || to_date) {
      const filterInfo = [];
      if (from_date) {
        filterInfo.push({ 'Filter Applied': 'From Date', 'Value': from_date });
      }
      if (to_date) {
        filterInfo.push({ 'Filter Applied': 'To Date', 'Value': to_date });
      }
      const filterWs = XLSX.utils.json_to_sheet(filterInfo);
      XLSX.utils.book_append_sheet(wb, filterWs, 'Filter Info');
    }

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Disposition', `attachment; filename=${filename}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (error) {
    console.error('Error downloading activity reports:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const deleteActivityReport = async (req, res) => {
  const { activity_id } = req.params;

  try {
    const [activityRows] = await pool.query(
      'SELECT activity_id FROM activities WHERE activity_id = ?',
      [activity_id]
    );

    if (activityRows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const [result] = await pool.query(
      'DELETE FROM activities WHERE activity_id = ?',
      [activity_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    res.status(200).json({ message: 'Activity report deleted successfully' });
  } catch (error) {
    console.error('deleteActivityReport - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

// ==============================
// Added Branch List for Superadmin
// ==============================

const getAllBranches = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT branch_id, branch_name FROM branches ORDER BY branch_name ASC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

module.exports = { 
  addBranch, 
  addAdminToBranch, 
  addSuperadmin, 
  getAllAdmins, 
  getSystemStats, 
  deleteBranch, 
  deleteAdmin, 
  getBranchesWithInfo,
  getAllEmployees,
  getEmployeesByBranch,
  assignEmployeeToBranch,
  updateEmployeeStatus,
  deleteEmployee,
  createEmployee,
  updateEmployee,
  getEmployeeActivityReports,
  getEmployeeAttendanceReports,
  resetEmployeePassword,
  getDailyAttendanceAll,
  rejectAttendance,
  closeAttendance,
  getPendingOutAttendances,
  getMonthlyAttendance,
  downloadDailyAttendance,
  downloadAttendanceByRange,
  getEmployeeAttendanceReport,
  getAllLeaveApplications,
  getEmployeeLeaveApplications,
  updateLeaveStatus,
  deleteLeaveApplication,
  downloadLeaveApplications,
  getActivityReports,
  downloadActivityReports,
  deleteActivityReport,
  getAllBranches
};