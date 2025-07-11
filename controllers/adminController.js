const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');

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

const addEmployee = async (req, res) => {
  const { full_name, phone_no, email_id, aadhaar_no, username, password, profile_picture } = req.body;
  if (!full_name || !username || !password) {
    return res.status(400).json({ error: 'Full name, username, and password are required' });
  }

  try {
    const [existing] = await pool.query('SELECT emp_id FROM employee_master WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO employee_master (full_name, phone_no, email_id, aadhaar_no, username, password, profile_picture, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [full_name, phone_no || null, email_id || null, aadhaar_no || null, username, hashedPassword, profile_picture || null, 1]
    );
    res.status(201).json({ emp_id: result.insertId, message: 'Employee added successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
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

module.exports = { getDailyAttendanceAll, rejectAttendance, getActivityReports, getMonthlyAttendance, addEmployee, downloadDailyAttendance, downloadAttendanceByRange };