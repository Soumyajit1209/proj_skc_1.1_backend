const jwt = require('jsonwebtoken');

const JWT_SECRET ="acb6ebcf5cd7b331a5e3b7ea4397c3b1ee1367bfc924102f8dc5f191f213ee19dc2cae4dc2d7f4338aa0f441df483fb3bbcea9b4248b70489a9078f6acb218cc";

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  const cookieToken = req.cookies?.token;
  const tokenToVerify = cookieToken || token;

  if (!tokenToVerify) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(tokenToVerify, JWT_SECRET , (err, user) => {
    if (err) {
      console.error('Token verification error:', err.message); 
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

module.exports = { authenticateToken };

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
};

module.exports = { authenticateToken, restrictTo }; 



