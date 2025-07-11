const express = require('express');
const { authenticateToken, restrictTo } = require('../middleware/authMiddleware');
const { getDailyAttendanceAll, rejectAttendance, getActivityReports, getMonthlyAttendance, addEmployee } = require('../controllers/adminController');

const router = express.Router();

router.get('/attendance/daily', authenticateToken, restrictTo('admin'), getDailyAttendanceAll);
router.put('/attendance/:attendance_id/reject', authenticateToken, restrictTo('admin'), rejectAttendance);
router.get('/activity', authenticateToken, restrictTo('admin'), getActivityReports);
router.get('/attendance/monthly', authenticateToken, restrictTo('admin'), getMonthlyAttendance);
router.post('/employee', authenticateToken, restrictTo('admin'), addEmployee);

module.exports = router;

