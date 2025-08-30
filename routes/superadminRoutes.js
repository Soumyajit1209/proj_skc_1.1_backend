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
  getEmployeesByBranch,
  assignEmployeeToBranch,
  updateEmployeeStatus,
  deleteEmployee,
  createEmployee,
  updateEmployee,
  getEmployeeActivityReports,
  getEmployeeAttendanceReports,
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
router.post('/add-superadmin', addSuperadmin); // Public route to create the initial superadmin

// Employee Management
router.get('/employees', authenticateToken, restrictTo('superadmin'), getAllEmployees);
router.get('/employees/branch/:branch_id', authenticateToken, restrictTo('superadmin'), getEmployeesByBranch);
router.post('/employees', authenticateToken, restrictTo('superadmin'), createEmployee);
router.put('/employees/:emp_id', authenticateToken, restrictTo('superadmin'), updateEmployee);
router.delete('/employees/:emp_id', authenticateToken, restrictTo('superadmin'), deleteEmployee);
router.put('/employees/:emp_id/status', authenticateToken, restrictTo('superadmin'), updateEmployeeStatus);
router.put('/employees/:emp_id/assign-branch', authenticateToken, restrictTo('superadmin'), assignEmployeeToBranch);
router.put('/employees/:emp_id/reset-password', authenticateToken, restrictTo('superadmin'), resetEmployeePassword);

// Reports and Analytics
router.get('/reports/activities', authenticateToken, restrictTo('superadmin'), getEmployeeActivityReports);
router.get('/reports/attendance', authenticateToken, restrictTo('superadmin'), getEmployeeAttendanceReports);

// System Stats
router.get('/stats', authenticateToken, restrictTo('superadmin'), getSystemStats);

module.exports = router;