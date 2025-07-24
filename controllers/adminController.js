const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// ==============================
// Multer Configuration for File Uploads
// ==============================

// Define upload directory and create it if it doesn't exist
const uploadDir = 'Uploads/profile_picture';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer storage for profile picture uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `employee-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

// Multer middleware for file upload with validation
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
// Attendance Management
// ==============================

/**
 * Retrieves daily attendance for all employees for the current day.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @returns {JSON} Array of attendance records with employee names.
 */
const getDailyAttendanceAll = async (req, res) => {
  try {
    // Fetch attendance records for today with employee names
    const [rows] = await pool.query(
      'SELECT ar.*, em.full_name FROM attendance_register ar JOIN employee_master em ON ar.emp_id = em.emp_id WHERE ar.attendance_date = CURDATE()'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching daily attendance:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

/**
 * Rejects an attendance record with remarks.
 * @param {Object} req - Express request object containing attendance ID and remarks.
 * @param {Object} res - Express response object.
 * @returns {JSON} Success message or error response.
 */
const rejectAttendance = async (req, res) => {
  const { attendance_id } = req.params;
  const { remarks } = req.body;

  try {
    // Update attendance record to REJECTED with remarks
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

/**
 * Retrieves monthly attendance for all employees.
 * @param {Object} req - Express request object containing month and year.
 * @param {Object} res - Express response object.
 * @returns {JSON} Array of attendance records for the specified month and year.
 */
const getMonthlyAttendance = async (req, res) => {
  const { month, year } = req.query;

  // Validate required query parameters
  if (!month || !year) {
    return res.status(400).json({ error: 'Month and year are required' });
  }

  try {
    // Fetch attendance records for the specified month and year
    const [rows] = await pool.query(
      'SELECT ar.*, em.full_name FROM attendance_register ar JOIN employee_master em ON ar.emp_id = em.emp_id WHERE MONTH(ar.attendance_date) = ? AND YEAR(ar.attendance_date) = ?',
      [month, year]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching monthly attendance:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

/**
 * Generates and downloads an Excel file of daily attendance for all employees.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @returns {Buffer} Excel file containing daily attendance data.
 */
const downloadDailyAttendance = async (req, res) => {
  try {
    // Fetch daily attendance records
    const [rows] = await pool.query(
      'SELECT ar.*, em.full_name FROM attendance_register ar JOIN employee_master em ON ar.emp_id = em.emp_id WHERE ar.attendance_date = CURDATE()'
    );

    // Map data for Excel export
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

    // Create Excel workbook and worksheet
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Attendance');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    // Set response headers for file download
    res.setHeader('Content-Disposition', 'attachment; filename=daily_attendance.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (error) {
    console.error('Error downloading daily attendance:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

/**
 * Generates and downloads an Excel file of attendance records for a date range.
 * @param {Object} req - Express request object containing from_date and to_date.
 * @param {Object} res - Express response object.
 * @returns {Buffer} Excel file containing attendance data for the specified range.
 */
const downloadAttendanceByRange = async (req, res) => {
  const { from_date, to_date } = req.query;

  // Validate required query parameters
  if (!from_date || !to_date) {
    return res.status(400).json({ error: 'From date and to date are required' });
  }

  try {
    // Fetch attendance records for the specified date range
    const [rows] = await pool.query(
      'SELECT ar.*, em.full_name FROM attendance_register ar JOIN employee_master em ON ar.emp_id = em.emp_id WHERE ar.attendance_date BETWEEN ? AND ?',
      [from_date, to_date]
    );

    // Map data for Excel export
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

    // Create Excel workbook and worksheet
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance Range');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    // Set response headers for file download
    res.setHeader('Content-Disposition', `attachment; filename=attendance_${from_date}_to_${to_date}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (error) {
    console.error('Error downloading attendance range:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

/**
 * Generates an attendance report for a specific employee within a date range.
 * @param {Object} req - Express request object containing emp_id, from_date, and to_date.
 * @param {Object} res - Express response object.
 * @returns {JSON} Employee details, attendance records, and summary (total, present, absent days).
 */
const getEmployeeAttendanceReport = async (req, res) => {
  const { emp_id } = req.params;
  const { from_date, to_date } = req.query;

  // Validate required query parameters
  if (!from_date || !to_date) {
    return res.status(400).json({ error: 'From date and to date are required' });
  }

  try {
    // Fetch attendance records for the employee within the date range
    const [attendanceRows] = await pool.query(
      'SELECT ar.*, em.full_name FROM attendance_register ar JOIN employee_master em ON ar.emp_id = em.emp_id WHERE ar.emp_id = ? AND ar.attendance_date BETWEEN ? AND ?',
      [emp_id, from_date, to_date]
    );

    // Fetch employee details
    const [employee] = await pool.query(
      'SELECT emp_id, full_name FROM employee_master WHERE emp_id = ?',
      [emp_id]
    );

    if (!employee.length) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Calculate attendance summary
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
// Employee Management
// ==============================

/**
 * Adds a new employee with profile picture upload and password hashing.
 * @param {Object} req - Express request object containing employee details and optional profile picture.
 * @param {Object} res - Express response object.
 * @returns {JSON} Success message with employee ID or error response.
 */
const addEmployee = async (req, res) => {
  try {
    // Handle file upload with Multer
    upload.single('profile_picture')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      const { full_name, phone_no, email_id, aadhaar_no, username, password, is_active } = req.body;

      // Validate required fields
      if (!full_name || !username || !password) {
        return res.status(400).json({ error: 'Full name, username, and password are required' });
      }

      try {
        // Check for existing username
        const [existing] = await pool.query('SELECT emp_id FROM employee_master WHERE username = ?', [username]);
        if (existing.length > 0) {
          return res.status(400).json({ error: 'Username already exists' });
        }

        // Hash password and prepare profile picture path
        const hashedPassword = await bcrypt.hash(password, 10);
        const profilePicturePath = req.file ? `/Uploads/profile_picture/${req.file.filename}` : null;

        // Insert new employee
        const [result] = await pool.query(
          'INSERT INTO employee_master (full_name, phone_no, email_id, aadhaar_no, username, password, profile_picture, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            full_name,
            phone_no || null,
            email_id || null,
            aadhaar_no || null,
            username,
            hashedPassword,
            profilePicturePath,
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
    console.error('Unexpected error in addEmployee:', error);
    res.status(500).json({ error: 'Unexpected server error', details: error.message });
  }
};

/**
 * Retrieves all employees from the database.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @returns {JSON} Array of employee records.
 */
const getAllEmployees = async (req, res) => {
  try {
    // Fetch all employee details
    const [rows] = await pool.query(
      'SELECT emp_id, full_name, phone_no, email_id, aadhaar_no, profile_picture, username, is_active, created_at, updated_at FROM employee_master'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

/**
 * Updates an employee's details, including optional profile picture and password.
 * @param {Object} req - Express request object containing employee ID and updated details.
 * @param {Object} res - Express response object.
 * @returns {JSON} Success message or error response.
 */
const updateEmployee = async (req, res) => {
  try {
    // Handle file upload with Multer
    upload.single('profile_picture')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      const { emp_id } = req.params;
      const { full_name, phone_no, email_id, aadhaar_no, username, password, is_active } = req.body;

      // Validate required fields
      if (!full_name || !username) {
        return res.status(400).json({ error: 'Full name and username are required' });
      }

      try {
        // Check if employee exists
        const [existing] = await pool.query('SELECT * FROM employee_master WHERE emp_id = ?', [emp_id]);
        if (existing.length === 0) {
          return res.status(404).json({ error: 'Employee not found' });
        }

        // Check for username conflict
        const [usernameCheck] = await pool.query(
          'SELECT emp_id FROM employee_master WHERE username = ? AND emp_id != ?',
          [username, emp_id]
        );
        if (usernameCheck.length > 0) {
          return res.status(400).json({ error: 'Username already exists' });
        }

        // Prepare update data
        const updateData = {
          full_name,
          phone_no: phone_no || null,
          email_id: email_id || null,
          aadhaar_no: aadhaar_no || null,
          username,
          is_active: is_active !== undefined ? Number(is_active) : existing[0].is_active,
        };

        // Hash new password if provided
        if (password) {
          updateData.password = await bcrypt.hash(password, 10);
        }

        // Handle profile picture update
        if (req.file) {
          if (existing[0].profile_picture) {
            const oldFilePath = path.join(__dirname, '..', existing[0].profile_picture);
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
            }
          }
          updateData.profile_picture = `/Uploads/profile_picture/${req.file.filename}`;
        }

        // Update employee record
        await pool.query(
          'UPDATE employee_master SET full_name = ?, phone_no = ?, email_id = ?, aadhaar_no = ?, username = ?, password = ?, profile_picture = ?, is_active = ? WHERE emp_id = ?',
          [
            updateData.full_name,
            updateData.phone_no,
            updateData.email_id,
            updateData.aadhaar_no,
            updateData.username,
            updateData.password || existing[0].password,
            updateData.profile_picture || existing[0].profile_picture,
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

/**
 * Deletes an employee from the database.
 * @param {Object} req - Express request object containing employee ID.
 * @param {Object} res - Express response object.
 * @returns {JSON} Success message or error response.
 */
const deleteEmployee = async (req, res) => {
  const { emp_id } = req.params;

  try {
    // Check if employee exists
    const [existing] = await pool.query('SELECT emp_id FROM employee_master WHERE emp_id = ?', [emp_id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Delete employee record
    const [result] = await pool.query('DELETE FROM employee_master WHERE emp_id = ?', [emp_id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

// ==============================
// Leave Management
// ==============================

/**
 * Retrieves all leave applications from the database.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @returns {JSON} Array of leave applications with employee and admin details.
 */
const getAllLeaveApplications = async (req, res) => {
  try {
    // Fetch all leave applications with employee and admin details
    const [rows] = await pool.query(
      'SELECT la.*, em.full_name, a.username AS approved_by_username ' +
      'FROM leave_applications la ' +
      'JOIN employee_master em ON la.emp_id = em.emp_id ' +
      'LEFT JOIN admin a ON la.approved_by = a.id'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching all leave applications:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

/**
 * Retrieves leave applications for a specific employee.
 * @param {Object} req - Express request object containing employee ID.
 * @param {Object} res - Express response object.
 * @returns {JSON} Array of leave applications for the employee.
 */
const getEmployeeLeaveApplications = async (req, res) => {
  const { emp_id } = req.params;

  try {
    // Fetch leave applications for the specified employee
    const [rows] = await pool.query(
      'SELECT la.*, em.full_name, a.username AS approved_by_username ' +
      'FROM leave_applications la ' +
      'JOIN employee_master em ON la.emp_id = em.emp_id ' +
      'LEFT JOIN admin a ON la.approved_by = a.id ' +
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

/**
 * Updates the status of a leave application (APPROVED or REJECTED).
 * @param {Object} req - Express request object containing leave ID and new status.
 * @param {Object} res - Express response object.
 * @returns {JSON} Success message or error response.
 */
const updateLeaveStatus = async (req, res) => {
  const { leave_id } = req.params;
  const { status } = req.body;

  // Validate status
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be APPROVED or REJECTED' });
  }

  try {
    // Verify admin exists
    const [admin] = await pool.query('SELECT id, username FROM admin WHERE id = ?', [req.user.id]);
    if (admin.length === 0) {
      return res.status(403).json({ error: 'Unauthorized: Admin not found' });
    }

    // Check if leave application exists
    const [existing] = await pool.query('SELECT * FROM leave_applications WHERE leave_id = ?', [leave_id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Leave application not found' });
    }

    // Update leave status
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

/**
 * Deletes a leave application and its associated attachment.
 * @param {Object} req - Express request object containing leave ID.
 * @param {Object} res - Express response object.
 * @returns {JSON} Success message or error response.
 */
const deleteLeaveApplication = async (req, res) => {
  const { leave_id } = req.params;

  console.log('deleteLeaveApplication - leave_id:', leave_id);

  // Validate required parameter
  if (!leave_id) {
    return res.status(400).json({ error: 'Leave ID is required' });
  }

  try {
    // Check if leave application exists
    const [leaveRows] = await pool.query(
      'SELECT leave_id, leave_attachment FROM leave_applications WHERE leave_id = ?',
      [leave_id]
    );

    console.log('deleteLeaveApplication - Leave check:', leaveRows);

    if (leaveRows.length === 0) {
      return res.status(404).json({ error: 'Leave application not found' });
    }

    // Delete attachment file if it exists
    if (leaveRows[0].leave_attachment) {
      const filePath = path.join(__dirname, '..', leaveRows[0].leave_attachment);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete leave application
    const [result] = await pool.query(
      'DELETE FROM leave_applications WHERE leave_id = ?',
      [leave_id]
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
 * Generates and downloads an Excel file of leave applications with optional filters.
 * @param {Object} req - Express request object containing optional status and date range filters.
 * @param {Object} res - Express response object.
 * @returns {Buffer} Excel file containing leave application data.
 */
const downloadLeaveApplications = async (req, res) => {
  const { status, fromDate, toDate, from_date, to_date } = req.query;

  try {
    // Build dynamic query based on filters
    let query = 
      'SELECT la.*, em.full_name, a.username AS approved_by_username ' +
      'FROM leave_applications la ' +
      'JOIN employee_master em ON la.emp_id = em.emp_id ' +
      'LEFT JOIN admin a ON la.approved_by = a.id';
    
    let params = [];
    let whereConditions = [];

    // Apply status filter
    if (status && status !== 'ALL') {
      whereConditions.push('la.status = ?');
      params.push(status);
    }

    // Normalize date parameters
    const startDate = fromDate || from_date;
    const endDate = toDate || to_date;

    // Apply date range filters
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

    if (whereConditions.length > 0) {
      query += ' WHERE ' + whereConditions.join(' AND ');
    }

    query += ' ORDER BY la.application_datetime DESC';

    // Fetch leave applications
    const [rows] = await pool.query(query, params);

    // Map data for Excel export
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

    // Create Excel workbook and worksheet
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leave Applications');

    // Add filter info sheet if filters are applied
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

    // Generate dynamic filename
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

    // Set response headers for file download
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (error) {
    console.error('Error downloading leave applications:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

// ==============================
// Activity Management
// ==============================

/**
 * Retrieves activity reports, optionally filtered by date.
 * @param {Object} req - Express request object containing optional date filter.
 * @param {Object} res - Express response object.
 * @returns {JSON} Array of activity reports with employee names.
 */
const getActivityReports = async (req, res) => {
  const { date } = req.query;

  try {
    // Build query based on date filter
    const query = date
      ? 'SELECT a.*, em.full_name FROM activities a JOIN employee_master em ON a.emp_id = em.emp_id WHERE DATE(a.activity_datetime) = ?'
      : 'SELECT a.*, em.full_name FROM activities a JOIN employee_master em ON a.emp_id = em.emp_id';
    const [rows] = await pool.query(query, date ? [date] : []);

    res.json(rows);
  } catch (error) {
    console.error('Error fetching activity reports:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

/**
 * Generates and downloads an Excel file of activity reports with optional date range filters.
 * @param {Object} req - Express request object containing optional from_date and to_date.
 * @param {Object} res - Express response object.
 * @returns {Buffer} Excel file containing activity report data.
 */
const downloadActivityReports = async (req, res) => {
  const { from_date, to_date } = req.query;

  try {
    // Build dynamic query based on date range
    let query = 'SELECT a.*, em.full_name FROM activities a JOIN employee_master em ON a.emp_id = em.emp_id';
    let params = [];
    let filename = 'activity_reports';

    if (from_date && to_date) {
      query += ' WHERE DATE(a.activity_datetime) BETWEEN ? AND ?';
      params.push(from_date, to_date);
      filename += `_from_${from_date}_to_${to_date}`;
    } else if (from_date) {
      query += ' WHERE DATE(a.activity_datetime) >= ?';
      params.push(from_date);
      filename += `_from_${from_date}`;
    } else if (to_date) {
      query += ' WHERE DATE(a.activity_datetime) <= ?';
      params.push(to_date);
      filename += `_to_${to_date}`;
    }

    query += ' ORDER BY a.activity_datetime DESC';

    // Fetch activity reports
    const [rows] = await pool.query(query, params);

    // Map data for Excel export
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

    // Create Excel workbook and worksheet
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Activity Reports');

    // Add filter info sheet if filters are applied
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

    // Set response headers for file download
    res.setHeader('Content-Disposition', `attachment; filename=${filename}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (error) {
    console.error('Error downloading activity reports:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

/**
 * Deletes an activity report from the database.
 * @param {Object} req - Express request object containing activity ID.
 * @param {Object} res - Express response object.
 * @returns {JSON} Success message or error response.
 */
const deleteActivityReport = async (req, res) => {
  const { activity_id } = req.params;

  console.log('deleteActivityReport - activity_id:', activity_id);

  // Validate required parameter
  if (!activity_id) {
    return res.status(400).json({ error: 'Activity ID is required' });
  }

  try {
    // Check if activity exists
    const [activityRows] = await pool.query(
      'SELECT activity_id FROM activities WHERE activity_id = ?',
      [activity_id]
    );

    console.log('deleteActivityReport - Activity check:', activityRows);

    if (activityRows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    // Delete activity report
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

// Export all controller functions
module.exports = {
  getDailyAttendanceAll,
  rejectAttendance,
  getMonthlyAttendance,
  downloadDailyAttendance,
  downloadAttendanceByRange,
  getEmployeeAttendanceReport,
  addEmployee,
  getAllEmployees,
  updateEmployee,
  deleteEmployee,
  getAllLeaveApplications,
  getEmployeeLeaveApplications,
  updateLeaveStatus,
  deleteLeaveApplication,
  downloadLeaveApplications,
  getActivityReports,
  downloadActivityReports,
  deleteActivityReport
};