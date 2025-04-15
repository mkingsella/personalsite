import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import axios from 'axios';
import pkg from 'pg';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Pool } = pkg;
const app = express();
const PORT = process.env.PORT || 3000;

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Redirect HTTP to HTTPS (optional)
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(['https://', req.get('Host'), req.url].join(''));
  }
  next();
});

// Serve static files
app.use(express.static('public'));

// Mailgun Setup
const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY
});

// Handle email signups
app.post('/submit', async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    // Check if email already exists
    const existingEmail = await pool.query(
      'SELECT * FROM email_submissions WHERE email = $1',
      [email]
    );

    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ error: 'This email is already subscribed.' });
    }

    // Insert email into database if not duplicate
    console.log('✅ Inserting into database...');
    await pool.query('INSERT INTO email_submissions (email) VALUES ($1)', [email]);

    // Send confirmation email via Mailgun
    console.log('📧 Sending email via Mailgun...');
    await mg.messages.create(process.env.MAILGUN_DOMAIN, {
      from: 'Mike R. Kingsella <mike@kingsellafamily.com>',
      to: email,
      bcc: 'mike@kingsellafamily.com',
      subject: 'Thanks for joining Homefront!',
      html: `
      <p>👋 Hey there,</p>

      <p>
        Thanks for joining <em>Homefront</em>—the sharp, five-minute briefing for people who care deeply about fixing America’s housing shortage. Every two weeks, you'll get focused updates on new legislation, key policy wins, fresh momentum, and practical solutions helping advocates, builders, and policymakers build more homes.
      </p>

      <p>
        I’ve spent my career in the trenches of housing policy — as the Founder & CEO of Up for Growth, I've had the opportunity to work with local leaders, state legislators, and members of Congress to unlock land use, lower costs, and get more homes built. <em>Homefront</em> is where I connect the dots: from legislation to zoning reform, from data to what’s really driving results on the ground.
      </p>

      <p>
        I'm excited to have you here. If you missed our first issue, don't worry—the next one will be in your inbox soon.
      </p>

      <p>
        Know someone else who cares about solving the housing shortage? Forward this email or invite them to subscribe at <a href="https://www.mikekingsella.com" target="_blank">www.mikekingsella.com</a>.
      </p>

      <p>
        <strong>Mike R. Kingsella</strong><br />
        Housing Policy | Founder, Up for Growth<br />
        📍 403 Elm Street | Frederick, Maryland 21701<br />
        📞 202-957-1006 | ✉️ <a href="mailto:mike@kingsellafamily.com">mike@kingsellafamily.com</a><br />
        📰 <a href="https://www.mikekingsella.com" target="_blank"><em>Homefront</em></a> |
        <a href="https://www.linkedin.com/in/mikekingsella/" target="_blank">LinkedIn</a>
      </p>

      <p>
        <strong>P.S.</strong> If you’re not already following me on
        <a href="https://www.linkedin.com/in/mikekingsella/" target="_blank">LinkedIn</a>,
        <a href="https://bsky.app/profile/mkingsella.upforgrowth.org" target="_blank">Bluesky</a>, and
        <a href="https://x.com/mikekingsella" target="_blank">X</a>,
        I’d love for you to join the conversation there too. It’s all part of building this network and driving real change.
      </p>
    `
    });

    // Slack notification
    console.log('📣 Sending Slack/Bolt alert...');
    const timestamp = new Date().toLocaleString();
    await axios.post(process.env.SLACK_WEBHOOK_URL, {
      text: `🎉 *New Signup* | 📧 ${email} | ⏰ ${timestamp}`
    });

    console.log('✅ All good, responding with success.');
    res.status(200).json({ message: 'Email submitted successfully!' });
  } catch (error) {
    console.error('❌ Submission error:', error);
    res.status(500).json({ error: 'Submission failed.' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Route to validate token and serve survey.html
app.get('/survey', async (req, res) => {
  const { token } = req.query;

  if (!token) return res.status(400).send('Invalid or missing survey link.');

  try {
    const result = await pool.query(
      'SELECT completed FROM subscriber_feedback WHERE token = $1',
      [token]
    );

    if (result.rows.length === 0 || result.rows[0].completed) {
      return res.status(403).send('Survey link is invalid or already used.');
    }

    res.sendFile(path.join(__dirname, 'public', 'survey.html'));
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error.');
  }
});

// Route to handle submitted form data
app.post('/submit-survey', async (req, res) => {
  const { token } = req.query;
  const { firstName, lastName, company, occupation, city, state, feedback, improvements, frequency } = req.body;

  if (!token) return res.status(400).json({ error: 'Missing survey token.' });

  try {
    const result = await pool.query(
      'SELECT email, completed FROM subscriber_feedback WHERE token = $1',
      [token]
    );

    if (result.rows.length === 0 || result.rows[0].completed) {
      return res.status(403).json({ error: 'Invalid or completed survey link.' });
    }

    const email = result.rows[0].email;

    // Update subscriber info
    await pool.query(`
      UPDATE email_submissions SET
        first_name=$1,
        last_name=$2,
        company=$3,
        occupation=$4,
        city=$5,
        state=$6
      WHERE email=$7
    `, [firstName, lastName, company, occupation, city, state, email]);

    // Update feedback record
    await pool.query(`
      UPDATE subscriber_feedback SET
        feedback=$1,
        improvements=$2,
        frequency=$3,
        completed=TRUE,
        submitted_at=NOW()
      WHERE token=$4
    `, [feedback, improvements, frequency, token]);

    res.json({ message: 'Thank you for your feedback!' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Submission failed.' });
  }
});

// Utility route to generate survey tokens (standalone, not nested)
app.post('/generate-survey-links', async (req, res) => {
  const { emails } = req.body;

  try {
    const generatedLinks = [];

    for (const email of emails) {
      const token = uuidv4();
      await pool.query(`
        INSERT INTO subscriber_feedback (email, token)
        VALUES ($1, $2)
      `, [email, token]);

      generatedLinks.push({
        email,
        surveyLink: `https://www.mikekingsella.com/survey.html?token=${token}`
      });
    }

    res.json({ generatedLinks });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate links.' });
  }
});

// Send survey email route
app.post('/send-survey-email', async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: 'Email is required.' });

  try {
    // Generate a token for the subscriber
    const token = uuidv4();

    // Store the token in your database linked to the subscriber
    await pool.query(`
      INSERT INTO subscriber_feedback (email, token)
      VALUES ($1, $2)
    `, [email, token]);

    // Construct personalized survey link
    const surveyLink = `https://www.mikekingsella.com/survey.html?token=${token}`;

    // Send survey email using Mailgun
    await mg.messages.create(process.env.MAILGUN_DOMAIN, {
      from: 'Mike R. Kingsella <mike@kingsellafamily.com>',
      to: email,
      subject: 'I’d love your feedback on Homefront!',
      html: `
        <p>👋 Hi there,</p>
        <p>Thanks for being part of the <em>Homefront</em> community! I'd really appreciate your feedback to help us improve your experience.</p>
        <p><strong>Please take a moment to complete this brief survey:</strong></p>
        <p><a href="${surveyLink}" target="_blank">👉 Click here to give feedback</a></p>
        <p>Thanks again for your support!</p>
        <p><strong>Mike R. Kingsella</strong><br />
        Founder, Up for Growth | Publisher, <em>Homefront</em></p>
      `
    });

    res.status(200).json({ message: 'Survey email sent successfully!' });

  } catch (error) {
    console.error('Error sending survey email:', error);
    res.status(500).json({ error: 'Failed to send survey email.' });
  }
});