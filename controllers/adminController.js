const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');

const getDailyAttendanceAll = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT ar.*, em.full_name FROM attendance_register ar JOIN employee_master em ON ar.emp_id = em.emp_id WHERE ar.attendance_date = CURDATE()'
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
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
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Attendance not found' });
    res.json({ message: 'Attendance rejected' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

const getActivityReports = async (req, res) => {
  const { date } = req.query;
  try {
    const query = date
      ? 'SELECT a.*, em.full_name FROM activities a JOIN employee_master em ON a.emp_id = em.emp_id WHERE DATE(a.activity_datetime) = ?'
      : 'SELECT a.*, em.full_name FROM activities a JOIN employee_master em ON a.emp_id = em.emp_id';
    const [rows] = await pool.query(query, date ? [date] : []);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

const getMonthlyAttendance = async (req, res) => {
  const { month, year } = req.query;
  try {
    const [rows] = await pool.query(
      'SELECT ar.*, em.full_name FROM attendance_register ar JOIN employee_master em ON ar.emp_id = em.emp_id WHERE MONTH(ar.attendance_date) = ? AND YEAR(ar.attendance_date) = ?',
      [month, year]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/profile_picture'); // Ensure this directory exists
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
});

const addEmployee = async (req, res) => {
  // Use multer to parse the file
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

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Get file path if uploaded
      const profilePicturePath = req.file ? `/uploads/${req.file.filename}` : null;

      // Insert employee data into the database
      const [result] = await pool.query(
        'INSERT INTO employee_master (full_name, phone_no, email_id, aadhaar_no, username, password, profile_picture, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          full_name,
          phone_no || null,
          email_id || null,
          aadhaar_no || null,
          username,
          hashedPassword,
          profilePicturePath, // Store file path instead of base64
          is_active !== undefined ? Number(is_active) : 1,
        ]
      );

      res.status(201).json({ emp_id: result.insertId, message: 'Employee added successfully' });
    } catch (error) {
      console.error('Error adding employee:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });
};

const downloadDailyAttendance = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT ar.*, em.full_name FROM attendance_register ar JOIN employee_master em ON ar.emp_id = em.emp_id WHERE ar.attendance_date = CURDATE()'
    );

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
    res.status(500).json({ error: 'Server error' });
  }
};

const downloadAttendanceByRange = async (req, res) => {
  const { from_date, to_date } = req.query;
  if (!from_date || !to_date) {
    return res.status(400).json({ error: 'From date and to date are required' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT ar.*, em.full_name FROM attendance_register ar JOIN employee_master em ON ar.emp_id = em.emp_id WHERE ar.attendance_date BETWEEN ? AND ?',
      [from_date, to_date]
    );

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
    res.status(500).json({ error: 'Server error' });
  }
};

const getAllEmployees = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT emp_id, full_name, phone_no, email_id, aadhaar_no, profile_picture, username, is_active, created_at, updated_at FROM employee_master'
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

const updateEmployee = async (req, res) => {
  const { emp_id } = req.params;
  const { full_name, phone_no, email_id, aadhaar_no, username, password, profile_picture, is_active } = req.body;

  try {
    // Check if employee exists
    const [existing] = await pool.query('SELECT emp_id FROM employee_master WHERE emp_id = ?', [emp_id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Check for username conflict (if username is being updated)
    if (username) {
      const [usernameCheck] = await pool.query('SELECT emp_id FROM employee_master WHERE username = ? AND emp_id != ?', [username, emp_id]);
      if (usernameCheck.length > 0) {
        return res.status(400).json({ error: 'Username already exists' });
      }
    }

    // Prepare update query
    const fields = [];
    const values = [];
    if (full_name) {
      fields.push('full_name = ?');
      values.push(full_name);
    }
    if (phone_no) {
      fields.push('phone_no = ?');
      values.push(phone_no);
    }
    if (email_id) {
      fields.push('email_id = ?');
      values.push(email_id);
    }
    if (aadhaar_no) {
      fields.push('aadhaar_no = ?');
      values.push(aadhaar_no);
    }
    if (username) {
      fields.push('username = ?');
      values.push(username);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      fields.push('password = ?');
      values.push(hashedPassword);
    }
    if (profile_picture) {
      fields.push('profile_picture = ?');
      values.push(profile_picture);
    }
    if (is_active !== undefined) {
      const isActiveValue = Number(is_active); 
      if (isNaN(isActiveValue) || (isActiveValue !== 0 && isActiveValue !== 1)) {
        return res.status(400).json({ error: 'Invalid is_active value. Must be 0 or 1.' });
      }
      fields.push('is_active = ?');
      values.push(isActiveValue);
    }
    fields.push('updated_at = NOW()');

    if (fields.length === 1) { // Only updated_at
      return res.status(400).json({ error: 'No fields to update' });
    }

    const query = `UPDATE employee_master SET ${fields.join(', ')} WHERE emp_id = ?`;
    values.push(emp_id);

    const [result] = await pool.query(query, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({ message: 'Employee updated successfully' });
  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteEmployee = async (req, res) => {
  const { emp_id } = req.params;

  try {
    // Check if employee exists
    const [existing] = await pool.query('SELECT emp_id FROM employee_master WHERE emp_id = ?', [emp_id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Delete employee
    const [result] = await pool.query('DELETE FROM employee_master WHERE emp_id = ?', [emp_id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getDailyAttendanceAll,
  rejectAttendance,
  getActivityReports,
  getMonthlyAttendance,
  addEmployee,
  downloadDailyAttendance,
  downloadAttendanceByRange,
  getAllEmployees,
  updateEmployee,
  deleteEmployee
};