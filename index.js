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
      subject: 'Thanks for joining Homefront!',
      html: `
      <p>👋 Hey there,</p>

      <p>
        Thanks for signing up early. <em>Homefront</em> launches April 12, and you’re already on the list. This newsletter is for people who care deeply about fixing the housing shortage — and want smart, fast updates on what’s actually working. Every two weeks, I’ll send a focused briefing on new laws, fresh momentum, and the most practical ideas to expand housing supply in communities across the country — and to give advocates, builders, and policymakers a sharper edge.
      </p>

      <p>
        I’ve spent my career in the trenches of housing policy — as the Founder & CEO of Up for Growth, I've had the opportunity to work with members of local leaders, state legislators, and members of Congress to unlock land use, lower costs, and get more homes built. <em>Homefront</em> is where I connect the dots: from legislation to zoning reform, from data to what’s really driving results on the ground.
      </p>

      <p>
        The first issue hits Saturday, April 12. You’ll be the first to see it. I’m glad you’re here — and I’m excited to share what’s ahead.
      </p>

      <p>
        If you know someone who cares about solving the housing shortage, feel free to forward this email or send them to <a href="https://www.mikekingsella.com" target="_blank">www.mikekingsella.com</a> to sign up.
      </p>

      <p>
        <strong>Mike R. Kingsella</strong><br />
        Housing Policy Advisor | Founder, Up for Growth<br />
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
