const express = require('express');
const { authenticateToken, restrictTo } = require('../middleware/authMiddleware');
const { getDailyAttendanceAll, rejectAttendance, getActivityReports, getMonthlyAttendance, addEmployee, downloadDailyAttendance, downloadAttendanceByRange , getAllEmployees } = require('../controllers/adminController');

const router = express.Router();

router.get('/attendance/daily', authenticateToken, restrictTo('admin'), getDailyAttendanceAll);
router.put('/attendance/:attendance_id/reject', authenticateToken, restrictTo('admin'), rejectAttendance);
router.get('/activity', authenticateToken, restrictTo('admin'), getActivityReports);
router.get('/attendance/monthly', authenticateToken, restrictTo('admin'), getMonthlyAttendance);
router.post('/employee', authenticateToken, restrictTo('admin'), addEmployee);
router.get('/attendance/daily/download', authenticateToken, restrictTo('admin'), downloadDailyAttendance);
router.get('/attendance/range/download', authenticateToken, restrictTo('admin'), downloadAttendanceByRange);
router.get('/all-employees' , authenticateToken , restrictTo('admin'), getAllEmployees);

module.exports = router;