const pool = require('../config/db');
const path = require('path');
const fs = require('fs');

// ==============================
// Attendance Management
// ==============================

/**
 * Records the employee's in-time for the current day.
 * @param {Object} req - Express request object containing employee ID and in-time details.
 * @param {Object} res - Express response object.
 * @returns {JSON} Success message with attendance ID or error response.
 */
const recordInTime = async (req, res) => {
  const { in_time, in_location, in_latitude, in_longitude } = req.body;
  const in_picture = req.file ? req.file.path : null;
  const emp_id = req.employee?.id;

  console.log('recordInTime - emp_id:', emp_id, 'body:', req.body);

  // Validate employee ID
  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    // Check if employee exists and is active
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

    // Check for existing in-time record for today
    const [existing] = await pool.query(
      'SELECT attendance_id FROM attendance_register WHERE emp_id = ? AND attendance_date = CURDATE()',
      [emp_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'In-time already recorded for today' });
    }

    // Insert new attendance record
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

/**
 * Records the employee's out-time for the current day.
 * @param {Object} req - Express request object containing employee ID and out-time details.
 * @param {Object} res - Express response object.
 * @returns {JSON} Success message or error response.
 */
const recordOutTime = async (req, res) => {
  const { out_time, out_location, out_latitude, out_longitude } = req.body;
  const out_picture = req.file ? req.file.path : null;
  const emp_id = req.employee?.id;

  console.log('recordOutTime - emp_id:', emp_id, 'body:', req.body);

  // Validate employee ID
  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    // Check if employee exists and is active
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

    // Check for existing attendance record for today
    const [existing] = await pool.query(
      'SELECT attendance_id FROM attendance_register WHERE emp_id = ? AND attendance_date = CURDATE()',
      [emp_id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'No in-time record found for today' });
    }

    // Update attendance record with out-time details
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

/**
 * Retrieves the employee's attendance record for the current day.
 * @param {Object} req - Express request object containing employee ID.
 * @param {Object} res - Express response object.
 * @returns {JSON} Attendance records or error response.
 */
const getDailyAttendance = async (req, res) => {
  const emp_id = req.employee?.id;

  console.log('getDailyAttendance - emp_id:', emp_id);

  // Validate employee ID
  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    // Check if employee exists and is active
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

    // Fetch attendance record for today
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

/**
 * Retrieves the employee's attendance records within a specified date range.
 * @param {Object} req - Express request object containing employee ID and date range.
 * @param {Object} res - Express response object.
 * @returns {JSON} Attendance records or error response.
 */
const getAttendanceByDateRange = async (req, res) => {
  const emp_id = req.employee?.id;
  const { start_date, end_date } = req.query;

  console.log('getAttendanceByDateRange - emp_id:', emp_id, 'start_date:', start_date, 'end_date:', end_date);

  // Validate employee ID and date formats
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

    // Build dynamic query based on date range
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

    query += ' ORDER BY attendance_date';

    console.log('getAttendanceByDateRange - Query:', query, 'Params:', params);

    // Execute query
    const [rows] = await pool.query(query, params);

    console.log('getAttendanceByDateRange - Result:', rows);

    res.json(rows);
  } catch (error) {
    console.error('getAttendanceByDateRange - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

// ==============================
// Attendance Status Checks
// ==============================

/**
 * Checks if the employee has checked in for the current day.
 * @param {Object} req - Express request object containing employee ID.
 * @param {Object} res - Express response object.
 * @returns {JSON} Boolean indicating check-in status or error response.
 */
const checkInAttendance = async (req, res) => {
  const emp_id = req.employee?.id;

  console.log('checkInAttendance - emp_id:', emp_id);

  // Validate employee ID
  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    // Check if employee exists and is active
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

    // Check for in-time record
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

/**
 * Checks if the employee has checked out for the current day.
 * @param {Object} req - Express request object containing employee ID.
 * @param {Object} res - Express response object.
 * @returns {JSON} Boolean indicating check-out status or error response.
 */
const checkOutAttendance = async (req, res) => {
  const emp_id = req.employee?.id;

  console.log('checkOutAttendance - emp_id:', emp_id);

  // Validate employee ID
  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    // Check if employee exists and is active
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

    // Check for out-time record
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

// ==============================
// Activity Report Management
// ==============================

/**
 * Submits a new activity report for the employee.
 * @param {Object} req - Express request object containing employee ID and activity details.
 * @param {Object} res - Express response object.
 * @returns {JSON} Success message with activity ID or error response.
 */
const submitActivityReport = async (req, res) => {
  const { customer_name, remarks, latitude, longitude, location } = req.body;
  const emp_id = req.employee?.id;

  console.log('submitActivityReport - emp_id:', emp_id, 'body:', req.body);

  // Validate employee ID
  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    // Check if employee exists and is active
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

    // Insert new activity report
    const [result] = await pool.query(
      'INSERT INTO activities (emp_id, customer_name, remarks, latitude, longitude, location) VALUES (?, ?, ?, ?, ?, ?)',
      [emp_id, customer_name, remarks, latitude, longitude, location]
    );

    res.status(201).json({ activity_id: result.insertId, message: 'Activity report submitted' });
  } catch (error) {
    console.error('submitActivityReport - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

/**
 * Edits an existing activity report.
 * @param {Object} req - Express request object containing employee ID and updated activity details.
 * @param {Object} res - Express response object.
 * @returns {JSON} Success message or error response.
 */
const editActivityReport = async (req, res) => {
  const { activity_id, customer_name, remarks } = req.body;
  const emp_id = req.employee?.id;

  console.log('editActivityReport - emp_id:', emp_id, 'activity_id:', activity_id);

  // Validate required fields
  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }
  if (!activity_id) {
    return res.status(400).json({ error: 'Activity ID is required' });
  }

  try {
    // Check if employee exists and is active
    const [employeeRows] = await pool.query(
      'SELECT emp_id, is_active FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('editActivityReport - Employee check:', employeeRows);

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employeeRows[0].is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    // Check if activity exists and belongs to the employee
    const [activityRows] = await pool.query(
      'SELECT activity_id, emp_id FROM activities WHERE activity_id = ?',
      [activity_id]
    );

    console.log('editActivityReport - Activity check:', activityRows);

    if (activityRows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    if (activityRows[0].emp_id !== emp_id) {
      return res.status(403).json({ error: 'Unauthorized: You can only edit your own activities' });
    }

    // Update activity report
    const [result] = await pool.query(
      'UPDATE activities SET customer_name = ?, remarks = ? WHERE activity_id = ?',
      [
        customer_name || null,
        remarks || null,
        activity_id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    res.status(200).json({ message: 'Activity report updated successfully' });
  } catch (error) {
    console.error('editActivityReport - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

/**
 * Deletes an activity report.
 * @param {Object} req - Express request object containing employee ID and activity ID.
 * @param {Object} res - Express response object.
 * @returns {JSON} Success message or error response.
 */
const deleteActivityReport = async (req, res) => {
  const { activity_id } = req.query;
  const emp_id = req.employee?.id;

  console.log('deleteActivityReport - emp_id:', emp_id, 'activity_id:', activity_id);

  // Validate required fields
  if (!activity_id || !emp_id) {
    return res.status(400).json({ error: 'Activity ID and employee ID are required' });
  }

  try {
    // Check if employee exists and is active
    const [employeeRows] = await pool.query(
      'SELECT emp_id, is_active FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('deleteActivityReport - Employee check:', employeeRows);

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employeeRows[0].is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    // Check if activity exists and belongs to the employee
    const [activityRows] = await pool.query(
      'SELECT activity_id FROM activities WHERE activity_id = ? AND emp_id = ?',
      [activity_id, emp_id]
    );

    console.log('deleteActivityReport - Activity check:', activityRows);

    if (activityRows.length === 0) {
      return res.status(404).json({ error: 'Activity report not found or access denied' });
    }

    // Delete activity report
    const [result] = await pool.query(
      'DELETE FROM activities WHERE activity_id = ? AND emp_id = ?',
      [activity_id, emp_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Activity report not found' });
    }

    res.status(200).json({ message: 'Activity report deleted successfully' });
  } catch (error) {
    console.error('deleteActivityReport - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

/**
 * Retrieves all activity reports for the employee.
 * @param {Object} req - Express request object containing employee ID.
 * @param {Object} res - Express response object.
 * @returns {JSON} Activity reports or error response.
 */
const getEmployeeActivityReports = async (req, res) => {
  const emp_id = req.employee?.id;

  console.log('getEmployeeActivityReports - emp_id:', emp_id);

  // Validate employee ID
  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    // Check if employee exists and is active
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

    // Fetch all activity reports
    const [rows] = await pool.query(
      'SELECT a.activity_id, a.emp_id, a.customer_name, a.remarks, a.activity_datetime, a.latitude, a.longitude, a.location, em.full_name ' +
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

/**
 * Retrieves activity reports within a specified date range.
 * @param {Object} req - Express request object containing employee ID and date range.
 * @param {Object} res - Express response object.
 * @returns {JSON} Activity reports or error response.
 */
const getActivityReportsByDateRange = async (req, res) => {
  const emp_id = req.employee?.id;
  const { start_date, end_date } = req.query;

  console.log('getActivityReportsByDateRange - emp_id:', emp_id, 'start_date:', start_date, 'end_date:', end_date);

  // Validate employee ID and date formats
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
    // Check if employee exists and is active
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

    // Build dynamic query based on date range
    let query = 'SELECT a.activity_id, a.emp_id, a.customer_name, a.remarks, a.activity_datetime, a.latitude, a.longitude, a.location, em.full_name ' +
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

    // Execute query
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

/**
 * Retrieves a single activity report by ID.
 * @param {Object} req - Express request object containing employee ID and activity ID.
 * @param {Object} res - Express response object.
 * @returns {JSON} Activity report or error response.
 */
const getActivityById = async (req, res) => {
  const { activity_id } = req.query;
  const emp_id = req.employee?.id;

  console.log('getActivityReportById - emp_id:', emp_id, 'activity_id:', activity_id);

  // Validate required fields
  if (!activity_id || !emp_id) {
    return res.status(400).json({ error: 'Activity ID and employee ID are required' });
  }

  try {
    // Check if employee exists and is active
    const [employeeRows] = await pool.query(
      'SELECT emp_id, is_active FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('getActivityReportById - Employee check:', employeeRows);

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employeeRows[0].is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    // Fetch activity report by ID
    const [rows] = await pool.query(
      'SELECT a.activity_id, a.emp_id, a.customer_name, a.remarks, a.activity_datetime, a.latitude, a.longitude, a.location, em.full_name ' +
      'FROM activities a ' +
      'JOIN employee_master em ON a.emp_id = em.emp_id ' +
      'WHERE a.activity_id = ? AND a.emp_id = ?',
      [activity_id, emp_id]
    );

    console.log('getActivityReportById - Result:', rows);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Activity report not found or access denied' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('getActivityReportById - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

// ==============================
// Leave Management
// ==============================

/**
 * Submits a new leave application for the employee.
 * @param {Object} req - Express request object containing employee ID and leave details.
 * @param {Object} res - Express response object.
 * @returns {JSON} Success message with leave ID or error response.
 */
const applyLeave = async (req, res) => {
  const { start_date, end_date, leave_type, reason } = req.body;
  const leave_attachment = req.file ? req.file.path : null;
  const emp_id = req.employee?.id;

  console.log('applyLeave - Request body:', req.body, 'emp_id:', emp_id);

  // Validate required fields
  if (!start_date || !end_date || !leave_type || !reason || !emp_id) {
    console.log('applyLeave - Missing required fields');
    return res.status(400).json({ error: 'Start date, end date, leave type, reason, and employee ID are required' });
  }

  try {
    // Check if employee exists and is active
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

    // Insert new leave application
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

/**
 * Edits an existing leave application.
 * @param {Object} req - Express request object containing employee ID and updated leave details.
 * @param {Object} res - Express response object.
 * @returns {JSON} Success message or error response.
 */
const editLeaveApplication = async (req, res) => {
  const { leave_id, start_date, end_date, leave_type, reason } = req.body;
  const leave_attachment = req.file ? req.file.path : null;
  const emp_id = req.employee?.id;

  console.log('editLeaveApplication - emp_id:', emp_id, 'leave_id:', leave_id, 'body:', req.body);

  // Validate required fields
  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }
  if (!leave_id) {
    return res.status(400).json({ error: 'Leave ID is required' });
  }
  if (!start_date || !end_date || !leave_type || !reason) {
    return res.status(400).json({ error: 'Start date, end date, leave type, and reason are required' });
  }

  try {
    // Check if employee exists and is active
    const [employeeRows] = await pool.query(
      'SELECT emp_id, is_active FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('editLeaveApplication - Employee check:', employeeRows);

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employeeRows[0].is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    // Check if leave application exists and belongs to the employee
    const [leaveRows] = await pool.query(
      'SELECT leave_id, emp_id, status, leave_attachment FROM leave_applications WHERE leave_id = ?',
      [leave_id]
    );

    console.log('editLeaveApplication - Leave check:', leaveRows);

    if (leaveRows.length === 0) {
      return res.status(404).json({ error: 'Leave application not found' });
    }
    if (leaveRows[0].emp_id !== emp_id) {
      return res.status(403).json({ error: 'Unauthorized: You can only edit your own leave applications' });
    }
    if (leaveRows[0].status !== 'PENDING') {
      return res.status(403).json({ error: 'Cannot edit leave application that is not pending' });
    }

    // Handle file deletion if new attachment is provided
    if (leave_attachment && leaveRows[0].leave_attachment) {
      const oldFilePath = path.join(__dirname, '..', leaveRows[0].leave_attachment);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }

    // Prepare update data
    const updateData = {
      start_date,
      end_date,
      leave_type,
      reason,
      leave_attachment: leave_attachment || leaveRows[0].leave_attachment
    };

    // Update leave application
    const [result] = await pool.query(
      'UPDATE leave_applications SET start_date = ?, end_date = ?, leave_type = ?, reason = ?, leave_attachment = ? WHERE leave_id = ?',
      [
        updateData.start_date,
        updateData.end_date,
        updateData.leave_type,
        updateData.reason,
        updateData.leave_attachment,
        leave_id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Leave application not found' });
    }

    res.status(200).json({ message: 'Leave application updated successfully' });
  } catch (error) {
    console.error('editLeaveApplication - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

/**
 * Deletes a leave application.
 * @param {Object} req - Express request object containing employee ID and leave ID.
 * @param {Object} res - Express response object.
 * @returns {JSON} Success message or error response.
 */
const deleteLeaveApplication = async (req, res) => {
  const { leave_id } = req.query;
  const emp_id = req.employee?.id;

  console.log('deleteLeaveApplication - emp_id:', emp_id, 'leave_id:', leave_id);

  // Validate required fields
  if (!leave_id || !emp_id) {
    return res.status(400).json({ error: 'Leave ID and employee ID are required' });
  }

  try {
    // Check if employee exists and is active
    const [employeeRows] = await pool.query(
      'SELECT emp_id, is_active FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('deleteLeaveApplication - Employee check:', employeeRows);

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employeeRows[0].is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    // Check if leave application exists and belongs to the employee
    const [leaveRows] = await pool.query(
      'SELECT leave_id, status FROM leave_applications WHERE leave_id = ? AND emp_id = ?',
      [leave_id, emp_id]
    );

    console.log('deleteLeaveApplication - Leave check:', leaveRows);

    if (leaveRows.length === 0) {
      return res.status(404).json({ error: 'Leave application not found or access denied' });
    }

    // Ensure only pending applications can be deleted
    if (leaveRows[0].status !== 'PENDING') {
      return res.status(400).json({ error: 'Cannot delete leave application. Only pending applications can be deleted' });
    }

    // Delete leave application
    const [result] = await pool.query(
      'DELETE FROM leave_applications WHERE leave_id = ? AND emp_id = ?',
      [leave_id, emp_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Leave application not found' });
    }

    res.status(200).json({ message: 'Leave application deleted successfully' });
  } catch (error) {
    console.error('deleteLeaveApplication - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

/**
 * Retrieves all leave applications for the employee.
 * @param {Object} req - Express request object containing employee ID.
 * @param {Object} res - Express response object.
 * @returns {JSON} Leave applications or error response.
 */
const getEmployeeLeaves = async (req, res) => {
  const emp_id = req.employee?.id;

  console.log('getEmployeeLeaves - emp_id:', emp_id);

  // Validate employee ID
  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    // Check if employee exists and is active
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

    // Fetch all leave applications
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

/**
 * Retrieves leave applications within a specified date range.
 * @param {Object} req - Express request object containing employee ID and date range.
 * @param {Object} res - Express response object.
 * @returns {JSON} Leave applications or error response.
 */
const getEmployeeLeavesByDateRange = async (req, res) => {
  const emp_id = req.employee?.id;
  const { start_date, end_date } = req.query;

  console.log('getEmployeeLeavesByDateRange - emp_id:', emp_id, 'start_date:', start_date, 'end_date:', end_date);

  // Validate employee ID and date formats
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
    // Check if employee exists and is active
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

    // Build dynamic query based on date range
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

    // Execute query
    const [rows] = await pool.query(query, params);

    console.log('getEmployeeLeavesByDateRange - Result:', rows);

    res.json(rows);
  } catch (error) {
    console.error('getEmployeeLeavesByDateRange - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

/**
 * Retrieves a single leave application by ID.
 * @param {Object} req - Express request object containing employee ID and leave ID.
 * @param {Object} res - Express response object.
 * @returns {JSON} Leave application or error response.
 */
const getLeaveById = async (req, res) => {
  const { leave_id } = req.query;
  const emp_id = req.employee?.id;

  console.log('getLeaveApplicationById - emp_id:', emp_id, 'leave_id:', leave_id);

  // Validate required fields
  if (!leave_id || !emp_id) {
    return res.status(400).json({ error: 'Leave ID and employee ID are required' });
  }

  try {
    // Check if employee exists and is active
    const [employeeRows] = await pool.query(
      'SELECT emp_id, is_active FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    console.log('getLeaveApplicationById - Employee check:', employeeRows);

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employeeRows[0].is_active) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    // Fetch leave application by ID
    const [rows] = await pool.query(
      'SELECT la.*, em.full_name, a.username AS approved_by_username ' +
      'FROM leave_applications la ' +
      'LEFT JOIN employee_master em ON la.emp_id = em.emp_id ' +
      'LEFT JOIN admin a ON la.approved_by = a.id ' +
      'WHERE la.leave_id = ? AND la.emp_id = ?',
      [leave_id, emp_id]
    );

    console.log('getLeaveApplicationById - Result:', rows);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Leave application not found or access denied' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('getLeaveApplicationById - Error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

// ==============================
// Employee Information
// ==============================

/**
 * Retrieves employee details by ID.
 * @param {Object} req - Express request object containing employee ID.
 * @param {Object} res - Express response object.
 * @returns {JSON} Employee details or error response.
 */
const getEmployeeById = async (req, res) => {
  const emp_id = req.employee?.id;

  console.log('getEmployeeById - emp_id:', emp_id);

  // Validate employee ID
  if (!emp_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    // Fetch employee details
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

// Export all controller functions
module.exports = {
  recordInTime,
  recordOutTime,
  getDailyAttendance,
  getAttendanceByDateRange,
  checkInAttendance,
  checkOutAttendance,
  submitActivityReport,
  editActivityReport,
  deleteActivityReport,
  getEmployeeActivityReports,
  getActivityReportsByDateRange,
  getActivityById,
  applyLeave,
  editLeaveApplication,
  deleteLeaveApplication,
  getEmployeeLeaves,
  getEmployeeLeavesByDateRange,
  getLeaveById,
  getEmployeeById
};