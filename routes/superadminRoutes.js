const express = require('express');
const { authenticateToken, restrictTo } = require('../middleware/authMiddleware');
const superadminController = require('../controllers/superadminController');
const router = express.Router();



router.post('/add-branch', authenticateToken, restrictTo('superadmin'), superadminController.addBranch);
router.post('/add-admin', authenticateToken, restrictTo('superadmin'), superadminController.addAdminToBranch);
module.exports = router;