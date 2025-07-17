const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || "acb6ebcf5cd7b331a5e3b7ea4397c3b1ee1367bfc924102f8dc5f191f213ee19dc2cae4dc2d7f4338aa0f441df483fb3bbcea9b4248b70489a9078f6acb218cc";

// Nodemailer configuration (use your SMTP service or a test service like Ethereal)
const transporter = nodemailer.createTransport({
  host: 'smtp.ethereal.email', // Replace with your SMTP host (e.g., smtp.gmail.com)
  port: 587,
  auth: {
    user: 'your_smtp_user', // Replace with your SMTP user
    pass: 'your_smtp_password', // Replace with your SMTP password
  },
});

const login = async (req, res) => {
  // Log request body for debugging
  console.log('Request body:', req.body);

  // Validate request body
  if (!req.body || !req.body.username || !req.body.password || !req.body.role) {
    return res.status(400).json({ error: 'Missing username, password, or role in request body' });
  }

  const { username, password, role } = req.body;
  try {
    const table = role === 'admin' ? 'admin' : 'employee_master';
    const idField = role === 'admin' ? 'id' : 'emp_id';
    
    // Define fields to select based on role
    const fields = role === 'admin' 
      ? 'id, username, password' // Adjust fields for admin table as needed
      : 'emp_id, full_name, phone_no, email_id, aadhaar_no, profile_picture, username, password, is_active, created_at, updated_at';
    
    const [rows] = await pool.query(`SELECT ${fields} FROM ${table} WHERE username = ?`, [username]);
    const user = rows[0];
    if (!user) return res.status(400).json({ error: 'Invalid username' });

    // Check if password is hashed
    if (!user.password || user.password.length < 30) {
      return res.status(500).json({ error: 'Stored password is not hashed. Please reset your password.' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

    // Generate JWT token
    const token = jwt.sign({ id: user[idField], role }, JWT_SECRET, { expiresIn: '1h' });

    // Prepare user data to send in response (exclude password for security)
    const userData = { ...user };
    delete userData.password; // Remove password from response

    // Send token, role, and user data
    res.json({ token, role, user: userData });
  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const { id, role } = req.user;
  try {
    const table = role === 'admin' ? 'admin' : 'employee_master';
    const idField = role === 'admin' ? 'id' : 'emp_id';
    const [rows] = await pool.query(`SELECT password FROM ${table} WHERE ${idField} = ?`, [id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const validPassword = await bcrypt.compare(oldPassword, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid old password' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(`UPDATE ${table} SET password = ? WHERE ${idField} = ?`, [hashedPassword, id]);
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error in changePassword:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const forgotPassword = async (req, res) => {
  const { email, role } = req.body;
  try {
    const table = role === 'admin' ? 'admin' : 'employee_master';
    const emailField = role === 'admin' ? 'username' : 'email_id';
    const idField = role === 'admin' ? 'id' : 'emp_id';
    const [rows] = await pool.query(`SELECT ${idField} FROM ${table} WHERE ${emailField} = ?`, [email]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, role, otp, expires_at) VALUES (?, ?, ?, ?)',
      [user[idField], role, otp, expiresAt]
    );

    await transporter.sendMail({
      to: email,
      subject: 'Password Reset OTP',
      text: `Your OTP for password reset is: ${otp}. It is valid for 15 minutes.`,
    });

    res.json({ message: 'OTP sent to email' });
  } catch (error) {
    console.error('Error in forgotPassword:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const resetPassword = async (req, res) => {
  const { otp, newPassword, role } = req.body;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM password_reset_tokens WHERE otp = ? AND role = ? AND expires_at > NOW()',
      [otp, role]
    );
    const resetRecord = rows[0];
    if (!resetRecord) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const table = role === 'admin' ? 'admin' : 'employee_master';
    const idField = role === 'admin' ? 'id' : 'emp_id';
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(`UPDATE ${table} SET password = ? WHERE ${idField} = ?`, [hashedPassword, resetRecord.user_id]);
    await pool.query('DELETE FROM password_reset_tokens WHERE otp = ?', [otp]);
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error in resetPassword:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { login, changePassword, forgotPassword, resetPassword };