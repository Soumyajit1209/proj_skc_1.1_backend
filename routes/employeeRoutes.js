const express = require('express');
const multer = require('multer');
const { authenticateToken, restrictTo } = require('../middleware/authMiddleware');
const { recordAttendance, getDailyAttendance, submitActivityReport, applyLeave } = require('../controllers/employeeController');

const router = express.Router();

// Multer setup for photo uploads
const storage = multer.diskStorage({
  destination: './uploads/selfies',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

router.post(
  '/attendance',
  authenticateToken,
  restrictTo('employee'),
  upload.fields([{ name: 'in_picture', maxCount: 1 }, { name: 'out_picture', maxCount: 1 }]),
  recordAttendance
);
router.get('/attendance/daily', authenticateToken, restrictTo('employee'), getDailyAttendance);
router.post('/activity', authenticateToken, restrictTo('employee'), submitActivityReport);
router.post('/leave', authenticateToken, restrictTo('employee'), applyLeave);

module.exports = router;