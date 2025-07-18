const pool = require('../config/db');

const recordInTime = async (req, res) => {
  const { in_time, in_location, in_latitude, in_longitude } = req.body;
  const in_picture = req.file ? req.file.path : null;
  const emp_id = req.employee?.id;

  console.log('recordInTime - emp_id:', emp_id, 'body:', req.body);

  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    const [employeeRows] = await pool.query(
      'SELECT emp_id, is_active FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('recordInTime - Employee check:', employeeRows);

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employeeRows[0].is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    const [existing] = await pool.query(
      'SELECT attendance_id FROM attendance_register WHERE emp_id = ? AND attendance_date = CURDATE()',
      [emp_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'In-time already recorded for today' });
    }

    const [result] = await pool.query(
      `INSERT INTO attendance_register (
        emp_id, attendance_date, in_time, in_location, in_latitude, in_longitude, 
        in_picture, in_status
      ) VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?)`,
      [
        emp_id,
        in_time || null,
        in_location || null,
        in_latitude || null,
        in_longitude || null,
        in_picture,
        'APPROVED'
      ]
    );

    res.status(201).json({ attendance_id: result.insertId, message: 'In-time recorded successfully' });
  } catch (error) {
    console.error('recordInTime - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const recordOutTime = async (req, res) => {
  const { out_time, out_location, out_latitude, out_longitude } = req.body;
  const out_picture = req.file ? req.file.path : null;
  const emp_id = req.employee?.id;

  console.log('recordOutTime - emp_id:', emp_id, 'body:', req.body);

  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    const [employeeRows] = await pool.query(
      'SELECT emp_id, is_active FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('recordOutTime - Employee check:', employeeRows);

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employeeRows[0].is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    const [existing] = await pool.query(
      'SELECT attendance_id FROM attendance_register WHERE emp_id = ? AND attendance_date = CURDATE()',
      [emp_id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'No in-time record found for today' });
    }

    const [result] = await pool.query(
      `UPDATE attendance_register 
       SET out_time = ?, out_location = ?, out_latitude = ?, out_longitude = ?, out_picture = ?
       WHERE attendance_id = ?`,
      [
        out_time || null,
        out_location || null,
        out_latitude || null,
        out_longitude || null,
        out_picture,
        existing[0].attendance_id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    res.status(200).json({ message: 'Out-time recorded successfully' });
  } catch (error) {
    console.error('recordOutTime - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const getDailyAttendance = async (req, res) => {
  const emp_id = req.employee?.id;

  console.log('getDailyAttendance - emp_id:', emp_id);

  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    const [employeeRows] = await pool.query(
      'SELECT emp_id, is_active FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('getDailyAttendance - Employee check:', employeeRows);

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employeeRows[0].is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM attendance_register WHERE emp_id = ? AND attendance_date = CURDATE()',
      [emp_id]
    );

    console.log('getDailyAttendance - Result:', rows);

    res.json(rows);
  } catch (error) {
    console.error('getDailyAttendance - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const getAttendanceByDateRange = async (req, res) => {
  const emp_id = req.employee?.id;
  const { start_date, end_date } = req.query;

  console.log('getAttendanceByDateRange - emp_id:', emp_id, 'start_date:', start_date, 'end_date:', end_date);

  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  // Validate date format if dates are provided
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (start_date && !dateRegex.test(start_date)) {
    return res.status(400).json({ error: 'Invalid start date format. Use YYYY-MM-DD' });
  }
  if (end_date && !dateRegex.test(end_date)) {
    return res.status(400).json({ error: 'Invalid end date format. Use YYYY-MM-DD' });
  }

  // Validate date range if both dates are provided
  if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
    return res.status(400).json({ error: 'Start date cannot be later than end date' });
  }

  try {
    // Check if employee exists and is active
    const [employeeRows] = await pool.query(
      'SELECT emp_id, is_active FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('getAttendanceByDateRange - Employee check:', employeeRows);

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employeeRows[0].is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    // Build query based on date range with formatted date-time
    let query = `SELECT 
      attendance_id,
      DATE(attendance_date) as attendance_date,
      emp_id,
      in_location,
      in_latitude,
      in_longitude,
      CASE 
        WHEN in_time IS NOT NULL THEN CONCAT(DATE(attendance_date), ' ', in_time)
        ELSE NULL 
      END as in_datetime,
      in_time,
      in_picture,
      in_status,
      out_location,
      out_latitude,
      out_longitude,
      CASE 
        WHEN out_time IS NOT NULL THEN CONCAT(DATE(attendance_date), ' ', out_time)
        ELSE NULL 
      END as out_datetime,
      out_time,
      out_picture,
      remarks
    FROM attendance_register WHERE emp_id = ?`;
    const params = [emp_id];

    // Add date range conditions based on what's provided
    if (start_date && end_date) {
      query += ' AND DATE(attendance_date) BETWEEN ? AND ?';
      params.push(start_date, end_date);
    } else if (start_date) {
      query += ' AND DATE(attendance_date) >= ?';
      params.push(start_date);
    } else if (end_date) {
      query += ' AND DATE(attendance_date) <= ?';
      params.push(end_date);
    }
    // If no date range provided, fetch all data for the employee

    query += ' ORDER BY attendance_date';

    console.log('getAttendanceByDateRange - Query:', query, 'Params:', params);

    const [rows] = await pool.query(query, params);

    console.log('getAttendanceByDateRange - Result:', rows);

    // Return empty array if no records found instead of 404 error
    res.json(rows);

  } catch (error) {
    console.error('getAttendanceByDateRange - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};
const checkInAttendance = async (req, res) => {
  const emp_id = req.employee?.id;

  console.log('checkInAttendance - emp_id:', emp_id);

  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    const [employeeRows] = await pool.query(
      'SELECT emp_id, is_active FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('checkInAttendance - Employee check:', employeeRows);

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employeeRows[0].is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    const [rows] = await pool.query(
      'SELECT attendance_id, in_time FROM attendance_register WHERE emp_id = ? AND attendance_date = CURDATE()',
      [emp_id]
    );

    console.log('checkInAttendance - Query result:', rows);

    const hasCheckedIn = rows.length > 0 && rows[0].in_time !== null;
    res.json({ hasCheckedIn });
  } catch (error) {
    console.error('checkInAttendance - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const checkOutAttendance = async (req, res) => {
  const emp_id = req.employee?.id;

  console.log('checkOutAttendance - emp_id:', emp_id);

  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    const [employeeRows] = await pool.query(
      'SELECT emp_id, is_active FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('checkOutAttendance - Employee check:', employeeRows);

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employeeRows[0].is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    const [rows] = await pool.query(
      'SELECT attendance_id, out_time FROM attendance_register WHERE emp_id = ? AND attendance_date = CURDATE()',
      [emp_id]
    );

    console.log('checkOutAttendance - Query result:', rows);

    const hasCheckedOut = rows.length > 0 && rows[0].out_time !== null;
    res.json({ hasCheckedOut });
  } catch (error) {
    console.error('checkOutAttendance - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const submitActivityReport = async (req, res) => {
  const { customer_name, remarks, latitude, longitude, location } = req.body;
  const emp_id = req.employee?.id;

  console.log('submitActivityReport - emp_id:', emp_id, 'body:', req.body);

  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    const [employeeRows] = await pool.query(
      'SELECT emp_id, is_active FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('submitActivityReport - Employee check:', employeeRows);

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employeeRows[0].is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    const [result] = await pool.query(
      'INSERT INTO activities (emp_id, customer_name, remarks, latitude , longitude, location) VALUES (?, ?, ?, ?, ?, ?)',
      [emp_id, customer_name, remarks, latitude, longitude, location]
    );

    res.status(201).json({ activity_id: result.insertId, message: 'Activity report submitted' });
  } catch (error) {
    console.error('submitActivityReport - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const getEmployeeActivityReports = async (req, res) => {
  const emp_id = req.employee?.id;

  console.log('getEmployeeActivityReports - emp_id:', emp_id);

  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    const [employeeRows] = await pool.query(
      'SELECT emp_id, is_active FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('getEmployeeActivityReports - Employee check:', employeeRows);

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employeeRows[0].is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    const [rows] = await pool.query(
      'SELECT a.activity_id, a.emp_id, a.customer_name, a.remarks, a.activity_datetime, a.latitude , a.longitude, a.location , em.full_name ' +
      'FROM activities a ' +
      'JOIN employee_master em ON a.emp_id = em.emp_id ' +
      'WHERE a.emp_id = ?',
      [emp_id]
    );

    console.log('getEmployeeActivityReports - Result:', rows);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No activity reports found' });
    }

    res.json(rows);
  } catch (error) {
    console.error('getEmployeeActivityReports - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const getActivityReportsByDateRange = async (req, res) => {
  const emp_id = req.employee?.id;
  const { start_date, end_date } = req.query;

  console.log('getActivityReportsByDateRange - emp_id:', emp_id, 'start_date:', start_date, 'end_date:', end_date);

  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (start_date && !dateRegex.test(start_date)) {
    return res.status(400).json({ error: 'Invalid start date format. Use YYYY-MM-DD' });
  }
  if (end_date && !dateRegex.test(end_date)) {
    return res.status(400).json({ error: 'Invalid end date format. Use YYYY-MM-DD' });
  }

  if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
    return res.status(400).json({ error: 'Start date cannot be later than end date' });
  }

  try {
    const [employeeRows] = await pool.query(
      'SELECT emp_id, is_active FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('getActivityReportsByDateRange - Employee check:', employeeRows);

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employeeRows[0].is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    let query = 'SELECT a.activity_id, a.emp_id, a.customer_name, a.remarks, a.activity_datetime,a.latitude , a.longitude, a.location, em.full_name ' +
      'FROM activities a ' +
      'JOIN employee_master em ON a.emp_id = em.emp_id ' +
      'WHERE a.emp_id = ?';
    const params = [emp_id];

    if (start_date && end_date) {
      query += ' AND DATE(a.activity_datetime) BETWEEN ? AND ?';
      params.push(start_date, end_date);
    } else if (start_date) {
      query += ' AND DATE(a.activity_datetime) >= ?';
      params.push(start_date);
    } else if (end_date) {
      query += ' AND DATE(a.activity_datetime) <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY a.activity_datetime';

    console.log('getActivityReportsByDateRange - Query:', query, 'Params:', params);

    const [rows] = await pool.query(query, params);

    console.log('getActivityReportsByDateRange - Result:', rows);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No activity reports found' });
    }

    res.json(rows);
  } catch (error) {
    console.error('getActivityReportsByDateRange - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const applyLeave = async (req, res) => {
  const { start_date, end_date, leave_type, reason } = req.body;
  const leave_attachment = req.file ? req.file.path : null;
  const emp_id = req.employee?.id;

  console.log('applyLeave - Request body:', req.body, 'emp_id:', emp_id);

  if (!start_date || !end_date || !leave_type || !reason || !emp_id) {
    console.log('applyLeave - Missing required fields');
    return res.status(400).json({ error: 'Start date, end date, leave type, reason, and employee ID are required' });
  }

  try {
    const [employeeRows] = await pool.query(
      'SELECT emp_id, is_active FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('applyLeave - Employee check:', employeeRows);

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employeeRows[0].is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    const [result] = await pool.query(
      'INSERT INTO leave_applications (emp_id, start_date, end_date, leave_type, reason, leave_attachment, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [emp_id, start_date, end_date, leave_type, reason, leave_attachment, 'PENDING']
    );

    console.log('applyLeave - Inserted leave_id:', result.insertId);
    res.status(201).json({ leave_id: result.insertId, message: 'Leave application submitted successfully' });
  } catch (error) {
    console.error('applyLeave - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const getEmployeeLeaves = async (req, res) => {
  const emp_id = req.employee?.id;

  console.log('getEmployeeLeaves - emp_id:', emp_id);

  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    const [employeeRows] = await pool.query(
      'SELECT emp_id, is_active FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('getEmployeeLeaves - Employee check:', employeeRows);

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employeeRows[0].is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    const [rows] = await pool.query(
      'SELECT la.*, em.full_name, a.username AS approved_by_username ' +
      'FROM leave_applications la ' +
      'LEFT JOIN employee_master em ON la.emp_id = em.emp_id ' +
      'LEFT JOIN admin a ON la.approved_by = a.id ' +
      'WHERE la.emp_id = ?',
      [emp_id]
    );

    console.log('getEmployeeLeaves - Result:', rows);

    res.json(rows);
  } catch (error) {
    console.error('getEmployeeLeaves - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};
const getEmployeeLeavesByDateRange = async (req, res) => {
  const emp_id = req.employee?.id;
  const { start_date, end_date } = req.query;

  console.log('getEmployeeLeavesByDateRange - emp_id:', emp_id, 'start_date:', start_date, 'end_date:', end_date);

  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (start_date && !dateRegex.test(start_date)) {
    return res.status(400).json({ error: 'Invalid start date format. Use YYYY-MM-DD' });
  }
  if (end_date && !dateRegex.test(end_date)) {
    return res.status(400).json({ error: 'Invalid end date format. Use YYYY-MM-DD' });
  }

  if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
    return res.status(400).json({ error: 'Start date cannot be later than end date' });
  }

  try {
    const [employeeRows] = await pool.query(
      'SELECT emp_id, is_active FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('getEmployeeLeavesByDateRange - Employee check:', employeeRows);

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employeeRows[0].is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    let query = 'SELECT la.*, em.full_name, a.username AS approved_by_username ' +
      'FROM leave_applications la ' +
      'LEFT JOIN employee_master em ON la.emp_id = em.emp_id ' +
      'LEFT JOIN admin a ON la.approved_by = a.id ' +
      'WHERE la.emp_id = ?';
    const params = [emp_id];

    if (start_date && end_date) {
      query += ' AND la.start_date BETWEEN ? AND ?';
      params.push(start_date, end_date);
    } else if (start_date) {
      query += ' AND la.start_date >= ?';
      params.push(start_date);
    } else if (end_date) {
      query += ' AND la.start_date <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY la.start_date';

    console.log('getEmployeeLeavesByDateRange - Query:', query, 'Params:', params);

    const [rows] = await pool.query(query, params);

    console.log('getEmployeeLeavesByDateRange - Result:', rows);

    res.json(rows);
  } catch (error) {
    console.error('getEmployeeLeavesByDateRange - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const getEmployeeById = async (req, res) => {
  const emp_id = req.employee?.id;

  console.log('getEmployeeById - emp_id:', emp_id);

  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT emp_id, full_name, phone_no, email_id, aadhaar_no, profile_picture, username, is_active, created_at, updated_at ' +
      'FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('getEmployeeById - Result:', rows);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('getEmployeeById - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

module.exports = {
  recordInTime,
  recordOutTime,
  getDailyAttendance,
  getAttendanceByDateRange,
  submitActivityReport,
  getEmployeeActivityReports,
  getActivityReportsByDateRange,
  applyLeave,
  getEmployeeLeaves,
  getEmployeeById,
  checkInAttendance,
  checkOutAttendance,
  getEmployeeLeavesByDateRange
};