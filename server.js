const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const adminRoutes = require('./routes/adminRoutes');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const app = express();
const port = 3001;



const frontendOrigins = process.env.FRONTEND_ORIGINS?.split(',') || [];
const appOrigins = process.env.APP_ORIGINS?.split(',') || [];
const allowedOrigins = [...frontendOrigins, ...appOrigins, '*'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static('uploads'));


// Routes
app.use('/api', authRoutes);
app.use('/api', employeeRoutes);
app.use('/api/admin', adminRoutes);



// Error handling for CORS
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS policy: Origin not allowed' });
  }
  next(err);
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});