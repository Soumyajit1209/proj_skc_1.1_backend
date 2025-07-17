const pool = require('../config/db');

const recordInTime = async (req, res) => {
  const { in_time, in_location, in_latitude, in_longitude } = req.body;
  const in_picture = req.files?.in_picture ? req.files.in_picture[0].path : null;

  try {
    // Check if an attendance record already exists for the employee on the current date
    const [existing] = await pool.query(
      'SELECT attendance_id FROM attendance_register WHERE emp_id = ? AND attendance_date = CURDATE()',
      [req.user.id]
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
        req.user.id,
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
    console.error('Error recording in-time:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const recordOutTime = async (req, res) => {
  const { out_time, out_location, out_latitude, out_longitude } = req.body;
  const out_picture = req.files?.out_picture ? req.files.out_picture[0].path : null;

  try {
    // Find the attendance record for the employee on the current date
    const [existing] = await pool.query(
      'SELECT attendance_id FROM attendance_register WHERE emp_id = ? AND attendance_date = CURDATE()',
      [req.user.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'No in-time record found for today. Please record in-time first.' });
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
    console.error('Error recording out-time:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getDailyAttendance = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM attendance_register WHERE emp_id = ? AND attendance_date = CURDATE()',
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching daily attendance:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const submitActivityReport = async (req, res) => {
  const { customer_name, remarks } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO activities (emp_id, customer_name, remarks) VALUES (?, ?, ?)',
      [req.user.id, customer_name, remarks]
    );
    res.status(201).json({ activity_id: result.insertId, message: 'Activity report submitted' });
  } catch (error) {
    console.error('Error submitting activity report:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getEmployeeActivityReports = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT a.activity_id, a.emp_id, a.customer_name, a.remarks, a.activity_datetime, em.full_name ' +
      'FROM activities a ' +
      'JOIN employee_master em ON a.emp_id = em.emp_id ' +
      'WHERE a.emp_id = ?',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No activity reports found for this employee' });
    }

    res.json(rows);
  } catch (error) {
    console.error('Error fetching employee activity reports:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const applyLeave = async (req, res) => {
  const { start_date, end_date, leave_type, reason } = req.body;
  const leave_attachment = req.file ? req.file.path : null;
  
  // Validate required fields
  if (!start_date || !end_date || !leave_type || !reason) {
    return res.status(400).json({ error: 'Start date, end date, leave type, and reason are required' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO leave_applications (emp_id, start_date, end_date, leave_type, reason, leave_attachment, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, start_date, end_date, leave_type, reason, leave_attachment, 'PENDING']
    );
    res.status(201).json({ leave_id: result.insertId, message: 'Leave application submitted successfully' });
  } catch (error) {
    console.error('Error submitting leave application:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getEmployeeLeaves = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT la.*, em.full_name, a.username AS approved_by_username ' +
      'FROM leave_applications la ' +
      'LEFT JOIN employee_master em ON la.emp_id = em.emp_id ' +
      'LEFT JOIN admin a ON la.approved_by = a.id ' +
      'WHERE la.emp_id = ?',
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching employee leaves:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getEmployeeById = async (req, res) => {
  const { emp_id } = req.params;
  
  // Ensure the authenticated user can only access their own data
  if (parseInt(emp_id) !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized: You can only access your own data' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT emp_id, full_name, phone_no, email_id, aadhaar_no, profile_picture, username, is_active, created_at, updated_at ' +
      'FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching employee data:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { 
  recordInTime,
  recordOutTime,
  getDailyAttendance, 
  submitActivityReport, 
  getEmployeeActivityReports,
  applyLeave, 
  getEmployeeLeaves, 
  getEmployeeById 
};