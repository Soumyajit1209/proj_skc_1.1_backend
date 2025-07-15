const express = require('express');
const { authenticateToken, restrictTo } = require('../middleware/authMiddleware');
const { 
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
} = require('../controllers/adminController');

const router = express.Router();

// Attendance Routes
router.get('/attendance/daily', authenticateToken, restrictTo('admin'), getDailyAttendanceAll);
router.put('/attendance/:attendance_id/reject', authenticateToken, restrictTo('admin'), rejectAttendance);
router.get('/attendance/monthly', authenticateToken, restrictTo('admin'), getMonthlyAttendance);
router.get('/attendance/daily/download', authenticateToken, restrictTo('admin'), downloadDailyAttendance);
router.get('/attendance/range/download', authenticateToken, restrictTo('admin'), downloadAttendanceByRange);

// Activity Reports
router.get('/activity', authenticateToken, restrictTo('admin'), getActivityReports);

// Employee Management
router.post('/employee', authenticateToken, restrictTo('admin'), addEmployee);
router.get('/all-employees', authenticateToken, restrictTo('admin'), getAllEmployees);
router.put('/employee/:emp_id', authenticateToken, restrictTo('admin'), updateEmployee);
router.delete('/employee/:emp_id', authenticateToken, restrictTo('admin'), deleteEmployee);

// Leave Management
router.get('/leaves', authenticateToken, restrictTo('admin'), getAllLeaveApplications);
router.get('/leaves/employee/:emp_id', authenticateToken, restrictTo('admin'), getEmployeeLeaveApplications);
router.put('/leaves/:leave_id', authenticateToken, restrictTo('admin'), updateLeaveStatus);
router.get('/leaves/download', authenticateToken, restrictTo('admin'), downloadLeaveApplications);

module.exports = router;