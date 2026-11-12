// Insert-only sample data. Fixed ids + ON CONFLICT DO NOTHING make re-runs harmless.
// Usage: npm run db:seed -- --confirm
import { connect } from './client.mjs';

if (!process.argv.includes('--confirm')) {
  console.error('Refusing to seed without --confirm (inserts fictional sample rows marked is_sample = true).');
  process.exit(1);
}

// Fictional example campuses.
const CC = 'Maple Valley Community College';
const UG = 'Bayview State University';
const RU = 'Northridge Institute of Research';

const users = [
  ['sample-user-1', 'Avery', CC, 'community_college'],
  ['sample-user-2', 'Jordan', UG, 'undergraduate'],
  ['sample-user-3', 'Priya', UG, 'undergraduate'],
  ['sample-user-4', 'Mateo', RU, 'graduate'],
  ['sample-user-5', 'Kenji', RU, 'doctoral'],
  ['sample-user-6', 'Sam', CC, 'community_college'],
];

// [id, seller, title, category, condition, price_cents, school, description]
const listings = [
  ['sample-listing-01', 'sample-user-2', 'Intro to Microeconomics textbook', 'Textbooks', 'Good', 2500, UG, 'Light highlighting, all pages intact.'],
  ['sample-listing-02', 'sample-user-3', 'Graphing calculator', 'Electronics', 'Like new', 4500, UG, 'Works great, includes cover.'],
  ['sample-listing-03', 'sample-user-1', 'Mini fridge', 'Dorm', 'Good', 6000, CC, 'Fits under a desk. Pickup only.'],
  ['sample-listing-04', 'sample-user-4', 'Lab coat (size M)', 'Lab gear', 'Like new', 1500, RU, 'Worn twice.'],
  ['sample-listing-05', 'sample-user-6', 'Desk lamp with USB port', 'Dorm', 'Good', 1200, CC, 'Warm and cool light modes.'],
  ['sample-listing-06', 'sample-user-5', 'Statistics with R handbook', 'Textbooks', 'Fair', 1800, RU, 'Some notes in margins.'],
  ['sample-listing-07', 'sample-user-2', 'Bike lock', 'Transport', 'Good', 1000, UG, 'Comes with two keys.'],
  ['sample-listing-08', 'sample-user-3', 'Noise-cancelling headphones', 'Electronics', 'Good', 7500, UG, 'Perfect for library sessions.'],
  ['sample-listing-09', 'sample-user-1', 'Chemistry lab goggles', 'Lab gear', 'Like new', 800, CC, 'Anti-fog.'],
  ['sample-listing-10', 'sample-user-4', 'Standing desk converter', 'Dorm', 'Good', 5500, RU, 'Adjustable height.'],
  ['sample-listing-11', 'sample-user-6', 'Campus hoodie (L)', 'Clothing', 'Good', 2000, CC, 'Cozy and warm.'],
  ['sample-listing-12', 'sample-user-5', 'Mechanical keyboard', 'Electronics', 'Like new', 4000, RU, 'Quiet switches.'],
  ['sample-listing-13', 'sample-user-2', 'Twin XL bedding set', 'Dorm', 'Good', 2200, UG, 'Washed and folded.'],
  ['sample-listing-14', 'sample-user-3', 'Organic Chemistry model kit', 'Lab gear', 'Like new', 2800, UG, 'All pieces included.'],
];

// [id, user, category, amount_cents, description, spent_on]
const expenses = [
  ['sample-expense-01', 'sample-user-2', 'Textbooks', 8900, 'Semester books', '2026-09-02'],
  ['sample-expense-02', 'sample-user-2', 'Food', 4250, 'Groceries', '2026-09-05'],
  ['sample-expense-03', 'sample-user-2', 'Transport', 2500, 'Monthly bus pass', '2026-09-01'],
  ['sample-expense-04', 'sample-user-2', 'Rent', 65000, 'Shared apartment', '2026-09-01'],
  ['sample-expense-05', 'sample-user-2', 'Fun', 1800, 'Movie night', '2026-09-12'],
  ['sample-expense-06', 'sample-user-2', 'Food', 3600, 'Coffee and snacks', '2026-09-15'],
  ['sample-expense-07', 'sample-user-2', 'Supplies', 1450, 'Notebooks and pens', '2026-09-03'],
  ['sample-expense-08', 'sample-user-2', 'Subscriptions', 1099, 'Music streaming', '2026-09-10'],
];

// [id, user, display_name, school, level, major, bio, interests]
const profiles = [
  ['sample-profile-1', 'sample-user-1', 'Avery', CC, 'community_college', 'Nursing', 'Transferring next fall, love study groups.', ['study groups', 'hiking']],
  ['sample-profile-2', 'sample-user-2', 'Jordan', UG, 'undergraduate', 'Economics', 'Budget nerd and coffee enthusiast.', ['finance', 'coffee']],
  ['sample-profile-3', 'sample-user-3', 'Priya', UG, 'undergraduate', 'Chemistry', 'Looking for lab partners and tutoring swaps.', ['chemistry', 'tutoring']],
  ['sample-profile-4', 'sample-user-4', 'Mateo', RU, 'graduate', 'Biomedical Engineering', 'Grad student, happy to mentor undergrads.', ['mentoring', 'robotics']],
  ['sample-profile-5', 'sample-user-5', 'Kenji', RU, 'doctoral', 'Statistics', 'PhD candidate, R and Python help available.', ['data science', 'board games']],
  ['sample-profile-6', 'sample-user-6', 'Sam', CC, 'community_college', 'Graphic Design', 'Freelance designer working through school.', ['design', 'music']],
];

// [id, user, title, category, rate_cents, description]
const skills = [
  ['sample-skill-1', 'sample-user-5', 'Statistics tutoring', 'Tutoring', 2000, 'One-hour sessions on R, Python, or intro stats.'],
  ['sample-skill-2', 'sample-user-6', 'Logo and poster design', 'Design', 3000, 'Club posters and simple logos.'],
  ['sample-skill-3', 'sample-user-3', 'Chemistry homework help', 'Tutoring', 1500, 'Gen chem and intro organic.'],
  ['sample-skill-4', 'sample-user-2', 'Resume review', 'Career', 1000, 'Feedback on resumes and cover letters.'],
];

const goals = [['sample-goal-1', 'sample-user-3', 'Robotics Club regional trip', 'club', 120000, 45000]];

const events = [
  ['sample-event-1', 'Robot Showcase and Bake Sale', 'Robotics Club', UG, 'Demo night raising funds for the regional competition trip.', 'Student Union, Room 204', '2026-12-04T18:00:00-08:00', 'sample-goal-1'],
];

const inserts = [
  ['users', 'INSERT INTO users (id, first_name, school, education_level, is_sample) VALUES ($1,$2,$3,$4,true) ON CONFLICT DO NOTHING', users],
  ['listings', 'INSERT INTO listings (id, seller_id, title, category, condition, price_cents, school, description, is_sample) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT DO NOTHING', listings],
  ['expenses', 'INSERT INTO expenses (id, user_id, category, amount_cents, description, spent_on, is_sample) VALUES ($1,$2,$3,$4,$5,$6,true) ON CONFLICT DO NOTHING', expenses],
  ['profiles', 'INSERT INTO profiles (id, user_id, display_name, school, education_level, major, bio, interests, opt_in, is_sample) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,true) ON CONFLICT DO NOTHING', profiles],
  ['skills', 'INSERT INTO skills (id, user_id, title, category, rate_cents, description, is_sample) VALUES ($1,$2,$3,$4,$5,$6,true) ON CONFLICT DO NOTHING', skills],
  ['goals', 'INSERT INTO goals (id, user_id, title, kind, target_cents, saved_cents, is_sample) VALUES ($1,$2,$3,$4,$5,$6,true) ON CONFLICT DO NOTHING', goals],
  ['events', 'INSERT INTO events (id, title, club_name, school, description, location, starts_at, goal_id, is_sample) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT DO NOTHING', events],
];

const client = connect();
await client.connect();
try {
  await client.query('BEGIN');
  const counts = {};
  for (const [table, sql, rows] of inserts) {
    counts[table] = 0;
    for (const row of rows) counts[table] += (await client.query(sql, row)).rowCount;
  }
  await client.query('COMMIT');
  console.log('Seed complete (rows inserted):', counts);
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  await client.end();
}
