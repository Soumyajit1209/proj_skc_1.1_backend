const express = require('express');
const multer = require('multer');
const { authenticateToken, restrictTo } = require('../middleware/authMiddleware');
const { recordAttendance, getDailyAttendance, submitActivityReport, applyLeave } = require('../controllers/employeeController');

const router = express.Router();

// Multer setup for photo uploads (attendance)
const attendanceStorage = multer.diskStorage({
  destination: './uploads/selfies',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

// Multer setup for leave attachments (PDF or images)
const leaveStorage = multer.diskStorage({
  destination: './uploads/leave_attachments',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

// File filter for leave attachments (accept PDF, JPG, JPEG, PNG)
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, JPG, JPEG, and PNG files are allowed'), false);
  }
};

const attendanceUpload = multer({ storage: attendanceStorage });
const leaveUpload = multer({ storage: leaveStorage, fileFilter });

router.post(
  '/attendance',
  authenticateToken,
  restrictTo('employee'),
  attendanceUpload.fields([{ name: 'in_picture', maxCount: 1 }, { name: 'out_picture', maxCount: 1 }]),
  recordAttendance
);
router.get('/attendance/daily', authenticateToken, restrictTo('employee'), getDailyAttendance);
router.post('/activity', authenticateToken, restrictTo('employee'), submitActivityReport);
router.post(
  '/leave',
  authenticateToken,
  restrictTo('employee'),
  leaveUpload.single('leave_attachment'),
  applyLeave
);

module.exports = router;