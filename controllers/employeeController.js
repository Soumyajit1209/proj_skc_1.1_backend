const pool = require('../config/db');

const recordAttendance = async (req, res) => {
  const { in_time, out_time, in_location, in_latitude, in_longitude, out_location, out_latitude, out_longitude } = req.body;
  const in_picture = req.files?.in_picture ? req.files.in_picture[0].path : null;
  const out_picture = req.files?.out_picture ? req.files.out_picture[0].path : null;
  try {
    await pool.query(
      `INSERT INTO attendance_register (
        emp_id, attendance_date, in_time, out_time, in_location, in_latitude, in_longitude, 
        in_picture, out_location, out_latitude, out_longitude, out_picture, in_status
      ) VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        in_time || null,
        out_time || null,
        in_location,
        in_latitude,
        in_longitude,
        in_picture,
        out_location,
        out_latitude,
        out_longitude,
        out_picture,
        'APPROVED',
      ]
    );
    res.status(201).json({ message: 'Attendance recorded' });
  } catch (error) {
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
    res.status(500).json({ error: 'Server error' });
  }
};

const applyLeave = async (req, res) => {
  const { start_date, end_date, leave_type, reason } = req.body;
  const leave_attachment = req.file ? req.file.path : null;
  try {
    const [result] = await pool.query(
      'INSERT INTO leave_applications (emp_id, start_date, end_date, leave_type, reason, leave_attachment, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, start_date, end_date, leave_type, reason, leave_attachment, 'PENDING']
    );
    res.status(201).json({ leave_id: result.insertId, message: 'Leave application submitted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { recordAttendance, getDailyAttendance, submitActivityReport, applyLeave };