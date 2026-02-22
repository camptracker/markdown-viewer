import { Router } from 'express';
import passport from 'passport';

const router = Router();

// Get current user
router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const u = req.user.toObject();
  delete u.github_access_token;
  delete u.google_access_token;
  // Tell frontend if this is an OAuth user or just a visitor
  u.isAuthenticated = !!(u.github_id || u.google_id);
  res.json({ user: u });
});

// GitHub OAuth
router.get('/github', (req, res, next) => {
  // Store visitor_id in session so passport strategy can transfer markdowns
  if (req.query.visitor_id) {
    req.session.visitorId = req.query.visitor_id;
  }
  passport.authenticate('github', { scope: ['user:email'] })(req, res, next);
});

router.get(
  '/github/callback',
  passport.authenticate('github', { failureRedirect: '/?auth=failed' }),
  (req, res) => {
    delete req.session.visitorId;
    res.redirect('/?auth=success');
  }
);

// Google OAuth
router.get('/google', (req, res, next) => {
  if (req.query.visitor_id) {
    req.session.visitorId = req.query.visitor_id;
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/?auth=failed' }),
  (req, res) => {
    delete req.session.visitorId;
    res.redirect('/?auth=success');
  }
);

// Logout — destroys session, frontend keeps visitor_id in localStorage
router.post('/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });
});

export default router;
