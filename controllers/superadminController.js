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

    // Get employees without branch allocation
    const [unallocatedEmployees] = await pool.query('SELECT COUNT(*) as count FROM employee_master WHERE branch_id IS NULL');

    const stats = {
      totalBranches: branchCount[0].count,
      totalAdmins: adminCount[0].count,
      totalEmployees: employeeCount[0].count,
      activeUsers: activeEmployees[0].count,
      unallocatedEmployees: unallocatedEmployees[0].count
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching system stats:', error);
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
  const { full_name, phone_no, email_id, aadhaar_no, username, password, branch_id } = req.body;
  
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  if (!full_name || !phone_no || !username || !password) {
    return res.status(400).json({ error: 'Full name, phone number, username, and password are required' });
  }

  try {
    // Check if branch exists (if branch_id is provided)
    if (branch_id) {
      const [branchCheck] = await pool.query('SELECT branch_id FROM branches WHERE branch_id = ?', [branch_id]);
      if (branchCheck.length === 0) {
        return res.status(404).json({ error: 'Branch not found' });
      }
    }

    // Check if username already exists in the same branch (or globally if no branch)
    let usernameCheckQuery = 'SELECT emp_id FROM employee_master WHERE username = ?';
    let usernameCheckParams = [username];
    
    if (branch_id) {
      usernameCheckQuery += ' AND branch_id = ?';
      usernameCheckParams.push(branch_id);
    }

    const [usernameCheck] = await pool.query(usernameCheckQuery, usernameCheckParams);
    if (usernameCheck.length > 0) {
      return res.status(400).json({ error: 'Username already exists in this branch' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create employee
    const [result] = await pool.query(
      'INSERT INTO employee_master (full_name, phone_no, email_id, aadhaar_no, username, password, branch_id, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
      [full_name, phone_no, email_id || null, aadhaar_no || null, username, hashedPassword, branch_id || null]
    );

    res.status(201).json({ 
      emp_id: result.insertId, 
      message: `Employee ${full_name} created successfully`,
      branch_allocated: branch_id ? true : false
    });
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const updateEmployee = async (req, res) => {
  const { emp_id } = req.params;
  const { full_name, phone_no, email_id, aadhaar_no, username, branch_id, is_active } = req.body;
  
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized: Superadmin only' });
  }

  try {
    // Check if employee exists
    const [employeeCheck] = await pool.query('SELECT emp_id, full_name FROM employee_master WHERE emp_id = ?', [emp_id]);
    if (employeeCheck.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Check if branch exists (if branch_id is provided)
    if (branch_id) {
      const [branchCheck] = await pool.query('SELECT branch_id FROM branches WHERE branch_id = ?', [branch_id]);
      if (branchCheck.length === 0) {
        return res.status(404).json({ error: 'Branch not found' });
      }
    }

    // Check if username already exists for another employee in the same branch
    if (username) {
      let usernameCheckQuery = 'SELECT emp_id FROM employee_master WHERE username = ? AND emp_id != ?';
      let usernameCheckParams = [username, emp_id];
      
      if (branch_id) {
        usernameCheckQuery += ' AND branch_id = ?';
        usernameCheckParams.push(branch_id);
      }

      const [usernameCheck] = await pool.query(usernameCheckQuery, usernameCheckParams);
      if (usernameCheck.length > 0) {
        return res.status(400).json({ error: 'Username already exists in this branch' });
      }
    }

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (full_name !== undefined) {
      updates.push('full_name = ?');
      params.push(full_name);
    }
    if (phone_no !== undefined) {
      updates.push('phone_no = ?');
      params.push(phone_no);
    }
    if (email_id !== undefined) {
      updates.push('email_id = ?');
      params.push(email_id);
    }
    if (aadhaar_no !== undefined) {
      updates.push('aadhaar_no = ?');
      params.push(aadhaar_no);
    }
    if (username !== undefined) {
      updates.push('username = ?');
      params.push(username);
    }
    if (branch_id !== undefined) {
      updates.push('branch_id = ?');
      params.push(branch_id);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(emp_id);

    const query = `UPDATE employee_master SET ${updates.join(', ')} WHERE emp_id = ?`;
    const [result] = await pool.query(query, params);

    if (result.affectedRows === 0) {
      return res.status(500).json({ error: 'Failed to update employee' });
    }

    res.json({ 
      message: `Employee updated successfully`,
      emp_id: emp_id
    });
  } catch (error) {
    console.error('Error updating employee:', error);
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
  resetEmployeePassword
};