require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const resourceRoutes = require('./resources');

const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the "public" folder
app.use(express.static('public'));

/////////////////////////////////////////////////////
// ROUTES TO SERVE HTML FILES  (DASHBOARD/PROFILE/COMMUNITY)
/////////////////////////////////////////////////////

// Default route → logon page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/logon.html');
});

// Dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

// Profile
app.get('/profile', (req, res) => {
  res.sendFile(__dirname + '/public/profile.html');
});

// Resources
app.get('/resources', (req, res) => {
  res.sendFile(__dirname + '/public/resources.html');
});

// Community (pretty URL)
app.get('/community', (req, res) => {
  res.sendFile(__dirname + '/public/community.html');
});

// Also support community.html directly
app.get('/community.html', (req, res) => {
  res.sendFile(__dirname + '/public/community.html');
});


// Writing Center form submission
app.post('/api/writing-request', async (req, res) => {
  const { name, email, topic, message } = req.body;

  if (!name || !email || !topic || !message) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const conn = await createConnection();
    await conn.execute(
      'INSERT INTO writing_requests (name, email, topic, message) VALUES (?, ?, ?, ?)',
      [name, email, topic, message]
    );
    await conn.end();

    res.status(201).json({ message: 'Your request has been submitted!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error submitting your request.' });
  }
});


/////////////////////////////////////////////////////
// DB CONNECTION + AUTH MIDDLEWARE
/////////////////////////////////////////////////////

async function createConnection() {
  return await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
}

// Authorization middleware
async function authenticateToken(req, res, next) {
  const raw = (req.headers['authorization'] || '').trim();
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw;

  if (!token) return res.status(401).json({ message: 'No token provided.' });

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid token.' });

    try {
      const conn = await createConnection();
      const [rows] = await conn.execute('SELECT email FROM user WHERE email = ?', [decoded.email]);
      await conn.end();

      if (!rows.length) return res.status(403).json({ message: 'Account not found.' });

      req.user = decoded;
      next();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Database error.' });
    }
  });
}

/////////////////////////////////////////////////////
// AUTH ROUTES: CREATE ACCOUNT + LOGIN
/////////////////////////////////////////////////////

// Create account
app.post('/api/create-account', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password required.' });

  try {
    const conn = await createConnection();
    const hashed = await bcrypt.hash(password, 10);

    await conn.execute('INSERT INTO user (email, password) VALUES (?, ?)', [email, hashed]);
    await conn.end();

    res.status(201).json({ message: 'Account created.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ message: 'Account already exists.' });

    console.error(err);
    return res.status(500).json({ message: 'Error creating account.' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password required.' });

  try {
    const conn = await createConnection();
    const [rows] = await conn.execute('SELECT * FROM user WHERE email = ?', [email]);
    await conn.end();

    if (!rows.length) return res.status(401).json({ message: 'Invalid login.' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Invalid login.' });

    const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login error.' });
  }
});

/////////////////////////////////////////////////////
// GET USERS
/////////////////////////////////////////////////////

app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const conn = await createConnection();
    const [rows] = await conn.execute('SELECT email FROM user');
    await conn.end();

    res.json({ emails: rows.map(r => r.email) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching users.' });
  }
});

/////////////////////////////////////////////////////
// NOTIFICATION PREFERENCES
/////////////////////////////////////////////////////

app.get('/api/notifications/prefs', authenticateToken, async (req, res) => {
  try {
    const email = req.user.email;
    const conn = await createConnection();

    const [rows] = await conn.execute(
      'SELECT notifications_enabled, notifications_paused_until FROM user WHERE email = ?',
      [email]
    );

    await conn.end();
    if (!rows.length) return res.status(404).json({ message: 'User not found.' });

    res.json({
      enabled: !!rows[0].notifications_enabled,
      pausedUntil: rows[0].notifications_paused_until,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching preferences.' });
  }
});

app.put('/api/notifications/prefs', authenticateToken, async (req, res) => {
  try {
    const { enabled, pausedUntil } = req.body;
    const email = req.user.email;

    const enableVal = enabled ? 1 : 0;
    let pauseVal = null;

    if (pausedUntil) {
      const dt = new Date(pausedUntil);
      if (!isNaN(dt.getTime()))
        pauseVal = dt.toISOString().slice(0, 19).replace('T', ' ');
    }

    const conn = await createConnection();
    await conn.execute(
      'UPDATE user SET notifications_enabled=?, notifications_paused_until=? WHERE email=?',
      [enableVal, pauseVal, email]
    );
    await conn.end();

    res.json({ message: 'Preferences updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating preferences.' });
  }
});

/////////////////////////////////////////////////////
// PROFILE API
/////////////////////////////////////////////////////

app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const email = req.user.email;
    const conn = await createConnection();

    const [rows] = await conn.execute(
      `SELECT email, full_name, major, academic_year, gpa, bio
       FROM user WHERE email = ?`,
      [email]
    );

    if (!rows.length) {
      await conn.end();
      return res.status(404).json({ message: 'User not found' });
    }

    const [classes] = await conn.execute(
      'SELECT COUNT(*) AS class_count FROM classes WHERE user_email=?',
      [email]
    );

    await conn.end();

    const u = rows[0];
    res.json({
      profile: {
        email: u.email,
        fullName: u.full_name || '',
        major: u.major || '',
        academicYear: u.academic_year || '',
        gpa: u.gpa !== null ? Number(u.gpa) : null,
        bio: u.bio || '',
        classCount: classes[0].class_count || 0,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error loading profile.' });
  }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const { fullName, major, academicYear, gpa, bio } = req.body;
    const email = req.user.email;

    let gpaVal = null;
    if (gpa !== '' && gpa !== null && gpa !== undefined) {
      const num = Number(gpa);
      if (num < 0 || num > 4.5 || isNaN(num))
        return res.status(400).json({ message: 'GPA must be 0.00–4.50' });
      gpaVal = num;
    }

    const conn = await createConnection();
    await conn.execute(
      `UPDATE user SET full_name=?, major=?, academic_year=?, gpa=?, bio=? WHERE email=?`,
      [
        fullName || null,
        major || null,
        academicYear || null,
        gpaVal,
        bio || null,
        email,
      ]
    );
    await conn.end();

    res.json({ message: 'Profile updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating profile.' });
  }
});

/////////////////////////////////////////////////////
// COMMUNITY + FRIENDSHIPS
/////////////////////////////////////////////////////

// Load full community list
app.get('/api/community', authenticateToken, async (req, res) => {
  try {
    const me = req.user.email;
    const conn = await createConnection();

    const [rows] = await conn.execute(
      `SELECT
         u.email, u.full_name, u.major, u.academic_year, u.gpa, u.bio,
         f1.status AS outgoing_status,
         f2.status AS incoming_status
       FROM user u
       LEFT JOIN friendships f1 ON f1.user_email=? AND f1.friend_email=u.email
       LEFT JOIN friendships f2 ON f2.user_email=u.email AND f2.friend_email=?
       WHERE u.email<>?`,
      [me, me, me]
    );

    await conn.end();

    const formatted = rows.map(r => {
      let rel = 'none';
      if (r.outgoing_status === 'accepted' || r.incoming_status === 'accepted')
        rel = 'friends';
      else if (r.outgoing_status === 'pending')
        rel = 'outgoing';
      else if (r.incoming_status === 'pending')
        rel = 'incoming';
      else if (r.outgoing_status === 'declined' || r.incoming_status === 'declined')
        rel = 'declined';

      return {
        email: r.email,
        fullName: r.full_name || r.email,
        major: r.major || '',
        academicYear: r.academic_year || '',
        gpa: r.gpa !== null ? Number(r.gpa) : null,
        bio: r.bio || '',
        relationship: rel,
      };
    });

    res.json({ community: formatted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error loading community.' });
  }
});

// Send friend request
app.post('/api/friends/request', authenticateToken, async (req, res) => {
  try {
    const me = req.user.email;
    const target = (req.body.toEmail || '').trim();

    if (target === me) return res.status(400).json({ message: 'Cannot friend yourself.' });
    if (!target) return res.status(400).json({ message: 'Missing email.' });

    const conn = await createConnection();

    const [exists] = await conn.execute('SELECT email FROM user WHERE email=?', [target]);
    if (!exists.length) {
      await conn.end();
      return res.status(404).json({ message: 'User not found.' });
    }

    const [existing] = await conn.execute(
      `SELECT * FROM friendships WHERE 
         (user_email=? AND friend_email=?) OR 
         (user_email=? AND friend_email=?)`,
      [me, target, target, me]
    );

    if (existing.length) {
      const row = existing[0];

      if (row.status === 'accepted') {
        await conn.end();
        return res.json({ message: 'Already friends.' });
      }

      if (row.user_email === target && row.status === 'pending') {
        await conn.execute('UPDATE friendships SET status="accepted" WHERE id=?', [row.id]);
        await conn.end();
        return res.json({ message: 'Friend request accepted automatically.' });
      }

      await conn.execute(
        'UPDATE friendships SET user_email=?, friend_email=?, status="pending" WHERE id=?',
        [me, target, row.id]
      );
      await conn.end();
      return res.json({ message: 'Friend request re-sent.' });
    }

    await conn.execute(
      'INSERT INTO friendships (user_email, friend_email, status) VALUES (?, ?, "pending")',
      [me, target]
    );
    await conn.end();

    res.status(201).json({ message: 'Friend request sent.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error sending request.' });
  }
});

// Accept / Decline friend request
app.post('/api/friends/respond', authenticateToken, async (req, res) => {
  try {
    const me = req.user.email;
    const { fromEmail, action } = req.body;

    const newStatus = action === 'accept' ? 'accepted' : 'declined';

    const conn = await createConnection();
    const [rows] = await conn.execute(
      'SELECT * FROM friendships WHERE user_email=? AND friend_email=? AND status="pending"',
      [fromEmail, me]
    );

    if (!rows.length) {
      await conn.end();
      return res.status(404).json({ message: 'No pending request.' });
    }

    await conn.execute(
      'UPDATE friendships SET status=? WHERE id=?',
      [newStatus, rows[0].id]
    );

    await conn.end();
    res.json({ message: `Request ${newStatus}.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating request.' });
  }
});

/////////////////////////////////////////////////////
// RESOURCES ROUTES
/////////////////////////////////////////////////////

app.use('/resources', resourceRoutes);

/////////////////////////////////////////////////////
// CLASSES API
/////////////////////////////////////////////////////

// Get classes
app.get('/api/classes', authenticateToken, async (req, res) => {
  try {
    const conn = await createConnection();
    const [rows] = await conn.execute(
      `SELECT id, course_name, subject, days,
              TIME_FORMAT(start_time, "%H:%i") AS start_time,
              TIME_FORMAT(end_time, "%H:%i") AS end_time
       FROM classes WHERE user_email=?
       ORDER BY created_at DESC`,
      [req.user.email]
    );
    await conn.end();

    res.json({ classes: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching classes.' });
  }
});

// Add class
app.post('/api/classes', authenticateToken, async (req, res) => {
  const { course_name, subject, days, start_time, end_time } = req.body;

  if (!course_name || !subject || !days || !start_time || !end_time)
    return res.status(400).json({ message: 'All fields required.' });

  try {
    const conn = await createConnection();

    const [result] = await conn.execute(
      'INSERT INTO classes (user_email, course_name, subject, days, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.email, course_name, subject, days, start_time, end_time]
    );

    const [rows] = await conn.execute(
      `SELECT id, course_name, subject, days,
              TIME_FORMAT(start_time, "%H:%i") AS start_time,
              TIME_FORMAT(end_time, "%H:%i") AS end_time
       FROM classes WHERE id=?`,
      [result.insertId]
    );

    await conn.end();
    res.status(201).json({ class: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error saving class.' });
  }
});

// Update class
app.put('/api/classes/:id', authenticateToken, async (req, res) => {
  const { course_name, subject, days, start_time, end_time } = req.body;
  const id = req.params.id;

  if (!course_name || !subject || !days || !start_time || !end_time)
    return res.status(400).json({ message: 'All fields required.' });

  try {
    const conn = await createConnection();

    const [check] = await conn.execute(
      'SELECT id FROM classes WHERE id=? AND user_email=?',
      [id, req.user.email]
    );
    if (!check.length) {
      await conn.end();
      return res.status(404).json({ message: 'Class not found.' });
    }

    await conn.execute(
      'UPDATE classes SET course_name=?, subject=?, days=?, start_time=?, end_time=? WHERE id=?',
      [course_name, subject, days, start_time, end_time, id]
    );

    const [rows] = await conn.execute(
      `SELECT id, course_name, subject, days,
              TIME_FORMAT(start_time, "%H:%i") AS start_time,
              TIME_FORMAT(end_time, "%H:%i") AS end_time
       FROM classes WHERE id=?`,
      [id]
    );

    await conn.end();
    res.json({ class: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating class.' });
  }
});

// Delete class
app.delete('/api/classes/:id', authenticateToken, async (req, res) => {
  const id = req.params.id;

  try {
    const conn = await createConnection();

    const [check] = await conn.execute(
      'SELECT id FROM classes WHERE id=? AND user_email=?',
      [id, req.user.email]
    );

    if (!check.length) {
      await conn.end();
      return res.status(404).json({ message: 'Class not found.' });
    }

    await conn.execute(
      'DELETE FROM classes WHERE id=? AND user_email=?',
      [id, req.user.email]
    );
    await conn.end();

    res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error deleting class.' });
  }
});

/////////////////////////////////////////////////////
// START SERVER
/////////////////////////////////////////////////////

app.listen(port, () => {
  console.log(`CourseConnect is live → http://localhost:${port}`);
});
