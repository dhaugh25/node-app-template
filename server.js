require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const resourceRoutes = require('./resources');

const app = express();
const port = 3000;

// --------------------------------------------------
// DB: connection pool (for new features)
// --------------------------------------------------
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// --------------------------------------------------
// Middleware
// --------------------------------------------------
app.use(express.json());
app.use(express.static('public'));

// --------------------------------------------------
// HTML ROUTES
// --------------------------------------------------
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/logon.html');
});

app.get('/dashboard', (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

app.get('/profile', (req, res) => {
  res.sendFile(__dirname + '/public/profile.html');
});

app.get('/resources', (req, res) => {
  res.sendFile(__dirname + '/public/resources.html');
});

app.get('/community', (req, res) => {
  res.sendFile(__dirname + '/public/community.html');
});

app.get('/community.html', (req, res) => {
  res.sendFile(__dirname + '/public/community.html');
});

// --------------------------------------------------
// DB helper used by older routes
// --------------------------------------------------
async function createConnection() {
  return await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
}

// --------------------------------------------------
// AUTH MIDDLEWARE
// --------------------------------------------------
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

      req.user = decoded; // { email }
      next();
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Database error.' });
    }
  });
}

// --------------------------------------------------
// AUTH ROUTES: CREATE ACCOUNT + LOGIN
// --------------------------------------------------
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

// --------------------------------------------------
// USERS LIST
// --------------------------------------------------
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

// --------------------------------------------------
// NOTIFICATION PREFERENCES
// --------------------------------------------------
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

// --------------------------------------------------
// PROFILE API
// --------------------------------------------------
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

// --------------------------------------------------
// COMMUNITY + FRIENDSHIPS
// --------------------------------------------------
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

// --------------------------------------------------
// RESOURCES ROUTES
// --------------------------------------------------
app.use('/resources', resourceRoutes);

// --------------------------------------------------
// CLASSES API
// --------------------------------------------------
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

// --------------------------------------------------
// ASSIGNMENTS (AGENDA) — used by dashboard/calendar
// --------------------------------------------------
app.get('/api/assignments', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, course_code, due_date, status, notes
       FROM assignments
       WHERE user_id = ?
       ORDER BY due_date ASC`,
      [req.user.email] // if you actually store numeric user_id, change this
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching assignments:', err);
    res.status(500).json({ error: 'Error fetching assignments' });
  }
});

app.post('/api/assignments', authenticateToken, async (req, res) => {
  const { title, course_code, due_date, notes } = req.body;

  if (!title || !due_date) {
    return res.status(400).json({ error: 'Title and due date are required' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO assignments (user_id, title, course_code, due_date, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.email, title.trim(), course_code || null, due_date, notes || null]
    );

    res.json({
      id: result.insertId,
      user_id: req.user.email,
      title,
      course_code,
      due_date,
      status: 'pending',
      notes
    });
  } catch (err) {
    console.error('Error creating assignment:', err);
    res.status(500).json({ error: 'Error creating assignment' });
  }
});

app.put('/api/assignments/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, course_code, due_date, status, notes } = req.body;

  try {
    await pool.query(
      `UPDATE assignments
       SET title = COALESCE(?, title),
           course_code = COALESCE(?, course_code),
           due_date = COALESCE(?, due_date),
           status = COALESCE(?, status),
           notes = COALESCE(?, notes)
       WHERE id = ? AND user_id = ?`,
      [
        title || null,
        course_code || null,
        due_date || null,
        status || null,
        notes || null,
        id,
        req.user.email
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating assignment:', err);
    res.status(500).json({ error: 'Error updating assignment' });
  }
});

app.delete('/api/assignments/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      `DELETE FROM assignments WHERE id = ? AND user_id = ?`,
      [id, req.user.email]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting assignment:', err);
    res.status(500).json({ error: 'Error deleting assignment' });
  }
});

// --------------------------------------------------
// WRITING / HELP REQUESTS (your existing routes)
// --------------------------------------------------
app.post('/api/writing-request', async (req, res) => {
  try {
    const { email, topic, message, urgency } = req.body;

    if (!email || !topic || !message) {
      return res.status(400).json({ message: 'Email, topic, and message are required.' });
    }

    const conn = await createConnection();

    await conn.execute(
      `INSERT INTO writing_requests (email, topic, message, urgency)
       VALUES (?, ?, ?, ?)`,
      [email, topic, message, urgency || 'low']
    );

    await conn.end();
    res.status(201).json({ message: 'Writing request submitted successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error submitting writing request.' });
  }
});

app.post('/api/help-request', async (req, res) => {
  try {
    const { email, topic, message, request_type } = req.body;

    if (!email || !topic || !message || !request_type) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    const conn = await createConnection();

    await conn.execute(
      `INSERT INTO writing_requests (email, topic, message, urgency, request_type)
       VALUES (?, ?, ?, 'low', ?)`,
      [email, topic, message, request_type]
    );

    await conn.end();

    res.status(201).json({ message: "Help request submitted!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// --------------------------------------------------
// STUDY CHAT: courses, user_courses, messages
// (uses numeric course_id + user email as user_id or adjust if needed)
// --------------------------------------------------

// NOTE: these assume table structure: courses(id, code, title),
// user_courses(id, user_id, course_id), course_messages(id, course_id, user_id, message,...)

// Get courses tied to logged-in user
app.get('/api/my-courses', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.code, c.title
       FROM user_courses uc
       JOIN courses c ON uc.course_id = c.id
       WHERE uc.user_id = ?`,
      [req.user.email]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching user courses:', err);
    res.status(500).json({ error: 'Error fetching courses' });
  }
});

// Add a course to user profile (creates course if needed)
app.post('/api/my-courses', authenticateToken, async (req, res) => {
  const { code, title } = req.body;

  if (!code || !title) {
    return res.status(400).json({ error: 'Course code and title are required' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query(
      'SELECT id FROM courses WHERE code = ? AND title = ?',
      [code.trim(), title.trim()]
    );

    let courseId;
    if (existing.length > 0) {
      courseId = existing[0].id;
    } else {
      const [insertCourse] = await conn.query(
        'INSERT INTO courses (code, title) VALUES (?, ?)',
        [code.trim(), title.trim()]
      );
      courseId = insertCourse.insertId;
    }

    await conn.query(
      `INSERT IGNORE INTO user_courses (user_id, course_id)
       VALUES (?, ?)`,
      [req.user.email, courseId]
    );

    await conn.commit();
    res.json({ courseId, code, title });
  } catch (err) {
    await conn.rollback();
    console.error('Error adding user course:', err);
    res.status(500).json({ error: 'Error adding course' });
  } finally {
    conn.release();
  }
});

app.delete('/api/my-courses/:courseId', authenticateToken, async (req, res) => {
  const { courseId } = req.params;

  try {
    await pool.query(
      'DELETE FROM user_courses WHERE user_id = ? AND course_id = ?',
      [req.user.email, courseId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing user course:', err);
    res.status(500).json({ error: 'Error removing course' });
  }
});

// Get messages for a specific course chat
app.get('/api/courses/:courseId/messages', authenticateToken, async (req, res) => {
  const { courseId } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT m.id, m.message, m.created_at,
              m.user_id AS user_email
       FROM course_messages m
       WHERE m.course_id = ?
       ORDER BY m.created_at ASC
       LIMIT 200`,
      [courseId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ error: 'Error fetching messages' });
  }
});

// Post a new message
app.post('/api/courses/:courseId/messages', authenticateToken, async (req, res) => {
  const { courseId } = req.params;
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO course_messages (course_id, user_id, message) VALUES (?, ?, ?)',
      [courseId, req.user.email, message.trim()]
    );

    res.json({
      id: result.insertId,
      courseId,
      userId: req.user.email,
      message: message.trim()
    });
  } catch (err) {
    console.error('Error posting message:', err);
    res.status(500).json({ error: 'Error posting message' });
  }
});

// --------------------------------------------------
// STUDY GROUPS based on shared courses
// --------------------------------------------------
app.post('/api/study-groups/auto-join', authenticateToken, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [myCourses] = await conn.query(
      'SELECT course_id FROM user_courses WHERE user_id = ?',
      [req.user.email]
    );

    if (myCourses.length === 0) {
      await conn.rollback();
      return res.json({ groups: [] });
    }

    const groupsJoined = [];

    for (const row of myCourses) {
      const courseId = row.course_id;

      const [existingGroup] = await conn.query(
        'SELECT id, name FROM study_groups WHERE course_id = ? LIMIT 1',
        [courseId]
      );

      let groupId;
      let groupName;

      if (existingGroup.length > 0) {
        groupId = existingGroup[0].id;
        groupName = existingGroup[0].name;
      } else {
        const [courseRows] = await conn.query(
          'SELECT code, title FROM courses WHERE id = ?',
          [courseId]
        );

        const label = courseRows.length
          ? `${courseRows[0].code} – ${courseRows[0].title}`
          : `Course ${courseId}`;

        groupName = `${label} Study Group`;

        const [insertGroup] = await conn.query(
          'INSERT INTO study_groups (course_id, name) VALUES (?, ?)',
          [courseId, groupName]
        );
        groupId = insertGroup.insertId;
      }

      await conn.query(
        `INSERT IGNORE INTO study_group_members (group_id, user_id)
         VALUES (?, ?)`,
        [groupId, req.user.email]
      );

      groupsJoined.push({ id: groupId, name: groupName, course_id: courseId });
    }

    await conn.commit();
    res.json({ groups: groupsJoined });
  } catch (err) {
    await conn.rollback();
    console.error('Error auto-joining study groups:', err);
    res.status(500).json({ error: 'Error creating/joining study groups' });
  } finally {
    conn.release();
  }
});

app.get('/api/study-groups', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT sg.id, sg.name, sg.course_id, c.code AS course_code, c.title AS course_title
       FROM study_group_members sgm
       JOIN study_groups sg ON sgm.group_id = sg.id
       LEFT JOIN courses c ON sg.course_id = c.id
       WHERE sgm.user_id = ?`,
      [req.user.email]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching study groups:', err);
    res.status(500).json({ error: 'Error fetching study groups' });
  }
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------
app.listen(port, () => {
  console.log(`CourseConnect is live → http://localhost:${port}`);
});
