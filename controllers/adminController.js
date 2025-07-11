const pool = require('../config/db');
const bcrypt = require('bcryptjs');

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
    // Check if username already exists
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

module.exports = { getDailyAttendanceAll, rejectAttendance, getActivityReports, getMonthlyAttendance, addEmployee };