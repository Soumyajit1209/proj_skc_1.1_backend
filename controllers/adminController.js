const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const getDailyAttendanceAll = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT ar.*, em.full_name FROM attendance_register ar JOIN employee_master em ON ar.emp_id = em.emp_id WHERE ar.attendance_date = CURDATE()'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching daily attendance:', error);
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
    console.error('Error rejecting attendance:', error);
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
    console.error('Error fetching activity reports:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getMonthlyAttendance = async (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) {
    return res.status(400).json({ error: 'Month and year are required' });
  }
  try {
    const [rows] = await pool.query(
      'SELECT ar.*, em.full_name FROM attendance_register ar JOIN employee_master em ON ar.emp_id = em.emp_id WHERE MONTH(ar.attendance_date) = ? AND YEAR(ar.attendance_date) = ?',
      [month, year]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching monthly attendance:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

const addEmployee = async (req, res) => {
  try {
    upload.single('profile_picture')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      const { full_name, phone_no, email_id, aadhaar_no, username, password, is_active } = req.body;

      if (!full_name || !username || !password) {
        return res.status(400).json({ error: 'Full name, username, and password are required' });
      }

      try {
        const [existing] = await pool.query('SELECT emp_id FROM employee_master WHERE username = ?', [username]);
        if (existing.length > 0) {
          return res.status(400).json({ error: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const profilePicturePath = req.file ? `/uploads/profile_picture/${req.file.filename}` : null;

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
        res.status(500).json({ error: 'Server error' });
      }
    });
  } catch (error) {
    console.error('Unexpected error in addEmployee:', error);
    res.status(500).json({ error: 'Unexpected server error' });
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
    console.error('Error downloading daily attendance:', error);
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
    console.error('Error downloading attendance range:', error);
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
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateEmployee = async (req, res) => {
  try {
    upload.single('profile_picture')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      const { emp_id } = req.params;
      const { full_name, phone_no, email_id, aadhaar_no, username, password, is_active } = req.body;

      if (!full_name || !username) {
        return res.status(400).json({ error: 'Full name and username are required' });
      }

      try {
        const [existing] = await pool.query('SELECT * FROM employee_master WHERE emp_id = ?', [emp_id]);
        if (existing.length === 0) {
          return res.status(404).json({ error: 'Employee not found' });
        }

        const [usernameCheck] = await pool.query(
          'SELECT emp_id FROM employee_master WHERE username = ? AND emp_id != ?',
          [username, emp_id]
        );
        if (usernameCheck.length > 0) {
          return res.status(400).json({ error: 'Username already exists' });
        }

        const updateData = {
          full_name,
          phone_no: phone_no || null,
          email_id: email_id || null,
          aadhaar_no: aadhaar_no || null,
          username,
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
        res.status(500).json({ error: 'Server error' });
      }
    });
  } catch (error) {
    console.error('Unexpected error in updateEmployee:', error);
    res.status(500).json({ error: 'Unexpected server error' });
  }
};

const deleteEmployee = async (req, res) => {
  const { emp_id } = req.params;

  try {
    const [existing] = await pool.query('SELECT emp_id FROM employee_master WHERE emp_id = ?', [emp_id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

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

const getAllLeaveApplications = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT la.*, em.full_name, a.username AS approved_by_username ' +
      'FROM leave_applications la ' +
      'JOIN employee_master em ON la.emp_id = em.emp_id ' +
      'LEFT JOIN admin a ON la.approved_by = a.id'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching all leave applications:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getEmployeeLeaveApplications = async (req, res) => {
  const { emp_id } = req.params;
  try {
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
    res.status(500).json({ error: 'Server error' });
  }
};

const updateLeaveStatus = async (req, res) => {
  const { leave_id } = req.params;
  const { status } = req.body;

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be APPROVED or REJECTED' });
  }

  try {
    // Verify admin exists
    const [admin] = await pool.query('SELECT id, username FROM admin WHERE id = ?', [req.user.id]);
    if (admin.length === 0) {
      return res.status(403).json({ error: 'Unauthorized: Admin not found' });
    }

    // Verify leave application exists
    const [existing] = await pool.query('SELECT * FROM leave_applications WHERE leave_id = ?', [leave_id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Leave application not found' });
    }

    const numericStatus = status === 'APPROVED' ? 1 : 0;

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
    res.status(500).json({ error: 'Server error' });
  }
};

const downloadLeaveApplications = async (req, res) => {
  const { from_date, to_date } = req.query;

  try {
    let query = 
      'SELECT la.*, em.full_name, a.username AS approved_by_username ' +
      'FROM leave_applications la ' +
      'JOIN employee_master em ON la.emp_id = em.emp_id ' +
      'LEFT JOIN admin a ON la.approved_by = a.id';
    
    let params = [];
    if (from_date && to_date) {
      query += ' WHERE la.application_datetime BETWEEN ? AND ?';
      params = [from_date, to_date];
    }

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
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    const filename = from_date && to_date 
      ? `leave_applications_${from_date}_to_${to_date}.xlsx`
      : 'leave_applications.xlsx';

    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (error) {
    console.error('Error downloading leave applications:', error);
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
  deleteEmployee,
  getAllLeaveApplications,
  getEmployeeLeaveApplications,
  updateLeaveStatus,
  downloadLeaveApplications
};