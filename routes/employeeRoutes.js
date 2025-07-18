const express = require('express');
const multer = require('multer');
const { validateEmpId } = require('../middleware/authMiddleware');
const { 
  recordInTime, 
  recordOutTime, 
  getDailyAttendance, 
  checkInAttendance, 
  checkOutAttendance,
  submitActivityReport, 
  getEmployeeActivityReports, 
  applyLeave, 
  getEmployeeLeaves, 
  getEmployeeById,
  getAttendanceByDateRange,
  getActivityReportsByDateRange,
  getEmployeeLeavesByDateRange
} = require('../controllers/employeeController');

const router = express.Router();

const attendanceStorage = multer.diskStorage({
  destination: 'uploads/selfies',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const leaveStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/leave_attachments';
    if (!require('fs').existsSync(dir)) {
      require('fs').mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  if (allowedTypes.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only PDF, JPG, JPEG, and PNG files are allowed'), false);
};

const attendanceUpload = multer({ storage: attendanceStorage });
const leaveUpload = multer({ storage: leaveStorage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });

router.post(
  '/attendance/in',
  attendanceUpload.single('in_picture'),
  validateEmpId,
  recordInTime
);

router.post(
  '/attendance/out',
  attendanceUpload.single('out_picture'),
  validateEmpId,
  recordOutTime
);

router.get(
  '/attendance/daily',
  validateEmpId,
  getDailyAttendance
);

router.get(
  '/attendance/range',
  validateEmpId,
  getAttendanceByDateRange
);

router.get(
  '/attendance/check/in',
  validateEmpId,
  checkInAttendance
);

router.get(
  '/attendance/check/out',
  validateEmpId,
  checkOutAttendance
);

router.post(
  '/activity',
  validateEmpId,
  submitActivityReport
);

router.get(
  '/employee/activity',
  validateEmpId,
  getEmployeeActivityReports
);

router.get(
  '/employee/activity/range',
  validateEmpId,
  getActivityReportsByDateRange
);

router.post(
  '/leave',
  validateEmpId,
  leaveUpload.single('leave_attachment'), 
  applyLeave
);

router.get(
  '/leaves',
  validateEmpId,
  getEmployeeLeaves
);
router.get(
  '/leaves/range',
  validateEmpId,
  getEmployeeLeavesByDateRange
);
router.get(
  '/employee',
  validateEmpId,
  getEmployeeById
);

module.exports = router;