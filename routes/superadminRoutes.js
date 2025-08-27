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
  getBranchesWithInfo
} = require('../controllers/superadminController');


router.post('/add-branch', authenticateToken, restrictTo('superadmin'), addBranch);
router.post('/add-admin', authenticateToken, restrictTo('superadmin'), addAdminToBranch);
router.post('/add-superadmin', addSuperadmin); // Public route to create the initial superadmin
router.get('/admins', authenticateToken, restrictTo('superadmin'), getAllAdmins);
router.get('/stats', authenticateToken, restrictTo('superadmin'), getSystemStats);
router.delete('/branch/:branch_id', authenticateToken, restrictTo('superadmin'), deleteBranch);
router.delete('/admin', authenticateToken, restrictTo('superadmin'), deleteAdmin);
router.get('/branches-info', authenticateToken, restrictTo('superadmin'), getBranchesWithInfo);

module.exports = router;