const express = require('express');
const multer = require('multer');
const { authenticateToken, restrictTo } = require('../middleware/authMiddleware');
const { recordInTime, recordOutTime, getDailyAttendance, submitActivityReport, getEmployeeActivityReports, applyLeave, getEmployeeLeaves, getEmployeeById } = require('../controllers/employeeController');

const router = express.Router();

// Multer setup for photo uploads (attendance)
const attendanceStorage = multer.diskStorage({
  destination: './Uploads/selfies',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

// Multer setup for leave attachments (PDF or images)
const leaveStorage = multer.diskStorage({
  destination: './Uploads/leave_attachments',
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
  '/attendance/in',
  authenticateToken,
  restrictTo('employee'),
  attendanceUpload.single('in_picture'),
  recordInTime
);

router.post(
  '/attendance/out',
  restrictTo('employee'),
  attendanceUpload.single('out_picture'),
  recordOutTime
);

router.get('/attendance/daily', restrictTo('employee'), getDailyAttendance);

router.post('/activity',  restrictTo('employee'), submitActivityReport);

router.get('/employee/activity', restrictTo('employee'), getEmployeeActivityReports);

router.post(
  '/leave',
  restrictTo('employee'),
  leaveUpload.single('leave_attachment'),
  applyLeave
);

router.get('/leaves', restrictTo('employee'), getEmployeeLeaves);

router.get('/employee/:emp_id', restrictTo('employee'), getEmployeeById);

module.exports = router;