const express = require('express');
const router = express.Router();
const { authenticateToken, restrictTo } = require('../middleware/authMiddleware');
const { 
  addBranch, 
  addAdminToBranch, 
  addSuperadmin,
  getAllAdmins,
  getSystemStats,
  deleteBranch,
  deleteAdmin,
  getBranchesWithInfo,
  getAllEmployees,
  assignEmployeeToBranch,
  updateEmployeeStatus,
  deleteEmployee,
  createEmployee,
  updateEmployee,
  getActivityReports,
  getDailyAttendanceAll,
  closeAttendance,
  rejectAttendance,
  downloadDailyAttendance,
  getAllLeaveApplications,
  updateLeaveStatus,
  deleteLeaveApplication,
  downloadLeaveApplications,
  deleteActivityReport,
  downloadActivityReports,
  resetEmployeePassword
} = require('../controllers/superadminController');

// Branch Management
router.post('/add-branch', authenticateToken, restrictTo('superadmin'), addBranch);
router.get('/branches-info', authenticateToken, restrictTo('superadmin'), getBranchesWithInfo);
router.delete('/branch/:branch_id', authenticateToken, restrictTo('superadmin'), deleteBranch);

// Admin Management
router.post('/add-admin', authenticateToken, restrictTo('superadmin'), addAdminToBranch);
router.get('/admins', authenticateToken, restrictTo('superadmin'), getAllAdmins);
router.delete('/admin/:admin_id', authenticateToken, restrictTo('superadmin'), deleteAdmin);
router.post('/add-superadmin', addSuperadmin); // Public route for initial superadmin creation

// Employee Management
router.get('/employees', authenticateToken, restrictTo('superadmin'), getAllEmployees);
router.post('/employees', authenticateToken, restrictTo('superadmin'), createEmployee);
router.put('/employees/:emp_id', authenticateToken, restrictTo('superadmin'), updateEmployee);
router.delete('/employees/:emp_id', authenticateToken, restrictTo('superadmin'), deleteEmployee);
router.put('/employees/:emp_id/status', authenticateToken, restrictTo('superadmin'), updateEmployeeStatus);
router.put('/employees/:emp_id/assign-branch', authenticateToken, restrictTo('superadmin'), assignEmployeeToBranch);
router.put('/employees/:emp_id/reset-password', authenticateToken, restrictTo('superadmin'), resetEmployeePassword);

// Attendance Management
router.get('/attendance/daily', authenticateToken, restrictTo('superadmin'), getDailyAttendanceAll);
router.put('/attendance/:attendance_id/close', authenticateToken, restrictTo('superadmin'), closeAttendance);
router.put('/attendance/:attendance_id/reject', authenticateToken, restrictTo('superadmin'), rejectAttendance);
router.get('/attendance/daily/download', authenticateToken, restrictTo('superadmin'), downloadDailyAttendance);

// Leave Management
router.get('/leaves', authenticateToken, restrictTo('superadmin'), getAllLeaveApplications);
router.put('/leaves/:leave_id/status', authenticateToken, restrictTo('superadmin'), updateLeaveStatus);
router.delete('/leaves/:leave_id', authenticateToken, restrictTo('superadmin'), deleteLeaveApplication);
router.get('/leaves/download', authenticateToken, restrictTo('superadmin'), downloadLeaveApplications);

// Activity Management
router.get('/activities', authenticateToken, restrictTo('superadmin'), getActivityReports);
router.delete('/activities/:activity_id', authenticateToken, restrictTo('superadmin'), deleteActivityReport);
router.get('/activities/download', authenticateToken, restrictTo('superadmin'), downloadActivityReports);

// System Stats
router.get('/stats', authenticateToken, restrictTo('superadmin'), getSystemStats);

module.exports = router;