require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the "public" folder
app.use(express.static('public'));

//////////////////////////////////////
//ROUTES TO SERVE HTML FILES
//////////////////////////////////////
// Default route to serve logon.html
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/logon.html');
});

// Route to serve dashboard.html
app.get('/dashboard', (req, res) => {
    res.sendFile(__dirname + '/public/dashboard.html');
});
//////////////////////////////////////
//END ROUTES TO SERVE HTML FILES
//////////////////////////////////////


/////////////////////////////////////////////////
//HELPER FUNCTIONS AND AUTHENTICATION MIDDLEWARE
/////////////////////////////////////////////////
// Helper function to create a MySQL connection
async function createConnection() {
    return await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
}

// **Authorization Middleware: Verify JWT Token and Check User in Database**
async function authenticateToken(req, res, next) {
    // Accept either "Bearer <token>" or the raw token string
    const raw = (req.headers['authorization'] || '').trim();
    const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw;

    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid token.' });
        }

        try {
            const connection = await createConnection();

            // Query the database to verify that the email is associated with an active account
            const [rows] = await connection.execute(
                'SELECT email FROM user WHERE email = ?',
                [decoded.email]
            );

            await connection.end();  // Close connection

            if (rows.length === 0) {
                return res.status(403).json({ message: 'Account not found or deactivated.' });
            }

            req.user = decoded;  // Save the decoded email for use in the route
            next();  // Proceed to the next middleware or route handler
        } catch (dbError) {
            console.error(dbError);
            res.status(500).json({ message: 'Database error during authentication.' });
        }
    });
}
/////////////////////////////////////////////////
//END HELPER FUNCTIONS AND AUTHENTICATION MIDDLEWARE
/////////////////////////////////////////////////


//////////////////////////////////////
//ROUTES TO HANDLE API REQUESTS
//////////////////////////////////////
// Route: Create Account
app.post('/api/create-account', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        const connection = await createConnection();
        const hashedPassword = await bcrypt.hash(password, 10);  // Hash password

        const [result] = await connection.execute(
            'INSERT INTO user (email, password) VALUES (?, ?)',
            [email, hashedPassword]
        );

        await connection.end();  // Close connection

        res.status(201).json({ message: 'Account created successfully!' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ message: 'An account with this email already exists.' });
        } else {
            console.error(error);
            res.status(500).json({ message: 'Error creating account.' });
        }
    }
});

// Route: Logon
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        const connection = await createConnection();

        const [rows] = await connection.execute(
            'SELECT * FROM user WHERE email = ?',
            [email]
        );

        await connection.end();  // Close connection

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const user = rows[0];

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const token = jwt.sign(
            { email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(200).json({ token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error logging in.' });
    }
});

// Route: Get All Email Addresses
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();

        const [rows] = await connection.execute('SELECT email FROM user');

        await connection.end();  // Close connection

        const emailList = rows.map((row) => row.email);
        res.status(200).json({ emails: emailList });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving email addresses.' });
    }
});
//////////////////////////////////////

//END ROUTES TO HANDLE API REQUESTS
//////////////////////////////////////



// =======================================================================
//                      NOTIFICATION PREFERENCES (ADDED)
// =======================================================================
//
// Requires the following columns in your `user` table:
//   notifications_enabled TINYINT(1) NOT NULL DEFAULT 1
//   notifications_paused_until DATETIME NULL
//
// SQL to add (run once):
// ALTER TABLE user
//   ADD COLUMN notifications_enabled TINYINT(1) NOT NULL DEFAULT 1,
//   ADD COLUMN notifications_paused_until DATETIME NULL;
// =======================================================================

// Helper (optional): server-side check for push workflows
function notificationsAllowed(prefs) {
    if (!prefs?.enabled) return false;
    if (!prefs?.pausedUntil) return true;
    return new Date(prefs.pausedUntil) <= new Date();
}

// GET current user's notification preferences
app.get('/api/notifications/prefs', authenticateToken, async (req, res) => {
    try {
        const email = req.user?.email;
        if (!email) return res.status(401).json({ message: 'No user in auth context' });

        const conn = await createConnection();
        const [rows] = await conn.execute(
            'SELECT notifications_enabled, notifications_paused_until FROM user WHERE email = ?',
            [email]
        );
        await conn.end();

        if (!rows.length) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            enabled: !!rows[0].notifications_enabled,
            pausedUntil: rows[0].notifications_paused_until, // may be null
            serverTime: new Date().toISOString()
        });
    } catch (err) {
        console.error('[notifications] GET prefs failed:', err);
        res.status(500).json({ message: 'Failed to load notification prefs' });
    }
});

// PUT update current user's notification preferences
app.put('/api/notifications/prefs', authenticateToken, async (req, res) => {
    try {
        const email = req.user?.email;
        if (!email) return res.status(401).json({ message: 'No user in auth context' });

        const { enabled, pausedUntil } = req.body;

        const enableVal = enabled === undefined ? 1 : (enabled ? 1 : 0);

        // Convert pausedUntil (ISO or local string) -> MySQL DATETIME or null
        let pauseVal = null;
        if (pausedUntil) {
            const dt = new Date(pausedUntil);
            if (!isNaN(dt.getTime())) {
                pauseVal = dt.toISOString().slice(0, 19).replace('T', ' ');
            }
        }

        const conn = await createConnection();
        await conn.execute(
            'UPDATE user SET notifications_enabled = ?, notifications_paused_until = ? WHERE email = ?',
            [enableVal, pauseVal, email]
        );
        await conn.end();

        res.json({ message: 'Preferences updated', enabled: !!enableVal, pausedUntil: pauseVal });
    } catch (err) {
        console.error('[notifications] PUT prefs failed:', err);
        res.status(500).json({ message: 'Failed to update notification prefs' });
    }
});

// Expose helper if needed elsewhere
app.locals.notificationsAllowed = notificationsAllowed;
// =======================================================================



// Start the server
app.listen(port, () => {
  console.log(`CourseConnect is live →  http://localhost:${port}`);
});


// Get classes for the authenticated user
app.get('/api/classes', authenticateToken, async (req, res) => {
  try {
    const connection = await createConnection();
    const [rows] = await connection.execute(
      'SELECT id, course_name, subject, days, TIME_FORMAT(start_time, "%H:%i") AS start_time, TIME_FORMAT(end_time, "%H:%i") AS end_time FROM classes WHERE user_email = ? ORDER BY created_at DESC',
      [req.user.email]
    );
    await connection.end();
    res.json({ classes: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching classes.' });
  }
});

// Create a new class for the authenticated user
app.post('/api/classes', authenticateToken, async (req, res) => {
  const { course_name, subject, days, start_time, end_time } = req.body;

  // Basic validation
  if (!course_name || !subject || !days || !start_time || !end_time) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const connection = await createConnection();
    const [result] = await connection.execute(
      'INSERT INTO classes (user_email, course_name, subject, days, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.email, course_name, subject, days, start_time, end_time]
    );
    // fetch the inserted row to return to client
    const [rows] = await connection.execute(
      'SELECT id, course_name, subject, days, TIME_FORMAT(start_time, "%H:%i") AS start_time, TIME_FORMAT(end_time, "%H:%i") AS end_time FROM classes WHERE id = ?',
      [result.insertId]
    );
    await connection.end();
    res.status(201).json({ class: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error saving class.' });
  }
});

// Update class
app.put('/api/classes/:id', authenticateToken, async (req, res) => {
  const id = req.params.id;
  const { course_name, subject, days, start_time, end_time } = req.body;

  if (!course_name || !subject || !days || !start_time || !end_time) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const connection = await createConnection();

    // Ensure the class belongs to this user
    const [checkRows] = await connection.execute(
      'SELECT id FROM classes WHERE id = ? AND user_email = ?',
      [id, req.user.email]
    );

    if (!checkRows || checkRows.length === 0) {
      await connection.end();
      return res.status(404).json({ message: 'Class not found.' });
    }

    await connection.execute(
      'UPDATE classes SET course_name = ?, subject = ?, days = ?, start_time = ?, end_time = ? WHERE id = ?',
      [course_name, subject, days, start_time, end_time, id]
    );

    // Return the updated record (same fields as GET /api/classes, no position)
    const [rows] = await connection.execute(
      'SELECT id, course_name, subject, days, ' +
      'TIME_FORMAT(start_time, "%H:%i") AS start_time, ' +
      'TIME_FORMAT(end_time, "%H:%i") AS end_time ' +
      'FROM classes WHERE id = ?',
      [id]
    );
    await connection.end();

    res.json({ class: rows[0] });
  } catch (err) {
    console.error('PUT /api/classes/:id error', err);
    res.status(500).json({ message: 'Error updating class.' });
  }
});

// Delete class
app.delete('/api/classes/:id', authenticateToken, async (req, res) => {
  const id = req.params.id;
  try {
    const connection = await createConnection();
    // Ensure ownership
    const [check] = await connection.execute('SELECT id FROM classes WHERE id = ? AND user_email = ?', [id, req.user.email]);
    if (!check || check.length === 0) {
      await connection.end();
      return res.status(404).json({ message: 'Class not found.' });
    }
    await connection.execute('DELETE FROM classes WHERE id = ? AND user_email = ?', [id, req.user.email]);
    await connection.end();
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('DELETE /api/classes/:id', err);
    res.status(500).json({ message: 'Error deleting class.' });
  }
});