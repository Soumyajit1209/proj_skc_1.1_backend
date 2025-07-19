const express = require('express');
const { login, changePassword, forgotPassword, resetPassword , changePasswordbyEmployee } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/login', login);
router.post('/change-password-employee', changePasswordbyEmployee);
router.post('/change-password', authenticateToken, changePassword);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;