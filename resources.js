const express = require('express');
const router = express.Router();

// Example static list of tutoring resources (replace later with DB or external API)
const sampleResources = [
  {
    id: 1,
    name: 'Math Tutoring Center',
    description: 'Offers drop-in math tutoring for all levels.',
    link: 'https://example.com/math-tutoring'
  },
  {
    id: 2,
    name: 'Writing Center',
    description: 'Provides writing assistance for essays and research papers.',
    link: 'https://example.com/writing-center'
  },
  {
    id: 3,
    name: 'CS Tutoring Lab',
    description: 'Tutoring support for programming and CS fundamentals.',
    link: 'https://example.com/cs-lab'
  }
];

// GET /resources/api → Return list of study resources
router.get('/api', (req, res) => {
  res.json({ resources: sampleResources });
});

// (Optional) Add dynamic routes in the future like POST / PUT etc.

module.exports = router;
