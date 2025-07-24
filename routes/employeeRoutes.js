const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { validateEmpId } = require('../middleware/authMiddleware');
const { 
  recordInTime, 
  recordOutTime, 
  getDailyAttendance, 
  checkInAttendance, 
  checkOutAttendance,
  submitActivityReport, 
  getEmployeeActivityReports, 
  editActivityReport,
  deleteActivityReport,
  applyLeave, 
  editLeaveApplication,
  deleteLeaveApplication,
  getEmployeeLeaves, 
  getEmployeeById,
  getAttendanceByDateRange,
  getActivityReportsByDateRange,
  getEmployeeLeavesByDateRange,
  getActivityById,
  getLeaveById

} = require('../controllers/employeeController');

const router = express.Router();

const attendanceStorage = multer.diskStorage({
  destination: 'Uploads/selfies',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const leaveStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'Uploads/leave_attachments';
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const fileFilter = (req, file, cb) => {
  console.log('File MIME type:', file.mimetype);
  const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
  const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype;
  if (allowedExtensions.includes(fileExtension) && allowedMimeTypes.includes(mimeType)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, JPG, JPEG, and PNG files are allowed'), false);
  }
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

router.post(
  '/edit_activity',
  validateEmpId,
  editActivityReport
);

router.delete(
  '/delete_activity',
  validateEmpId,
  deleteActivityReport
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
  leaveUpload.single('leave_attachment'), 
  validateEmpId,
  applyLeave
);

router.post(
  '/edit_leave',
  leaveUpload.single('leave_attachment'),
  validateEmpId,
  editLeaveApplication
);

router.delete(
  '/delete_leave',
  validateEmpId,
  deleteLeaveApplication
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

router.get('/fetch_leave', validateEmpId, getLeaveById);
router.get('/fetch_activity', validateEmpId, getActivityById);
module.exports = router;