import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import axios from 'axios';
import pkg from 'pg';
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
    console.log('✅ Inserting into database...');
    await pool.query('INSERT INTO email_submissions (email) VALUES ($1)', [email]);

    console.log('📧 Sending email via Mailgun...');
    await mg.messages.create(process.env.MAILGUN_DOMAIN, {
      from: 'Mike R. Kingsella <mike@kingsellafamily.com>',
      to: email,
      bcc: 'mike@kingsellafamily.com',
      subject: 'Welcome to Homefront!',
      html: `<p>Thanks for subscribing to <strong>Homefront</strong>!</p>`
    });

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
