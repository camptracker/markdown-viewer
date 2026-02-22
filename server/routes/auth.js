import { Router } from 'express';
import passport from 'passport';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../models/index.js';

const router = Router();

// Get current user
router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const u = req.user.toObject();
  delete u.github_access_token;
  delete u.google_access_token;
  res.json({ user: u });
});

// Create/get visitor session
router.post('/visitor', async (req, res) => {
  if (req.user) {
    const u = req.user.toObject();
    delete u.github_access_token;
    delete u.google_access_token;
    return res.json({ user: u });
  }

  const visitorId = uuidv4();
  const user = await User.create({ visitor_id: visitorId });
  req.session.visitorId = visitorId;
  const u = user.toObject();
  res.json({ user: u });
});

// GitHub OAuth
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));

router.get(
  '/github/callback',
  passport.authenticate('github', { failureRedirect: '/?auth=failed' }),
  async (req, res) => {
    // Merge visitor markdowns if visitor was logged in
    if (req.session.visitorId && req.user) {
      const visitor = await User.findOne({ visitor_id: req.session.visitorId });
      if (visitor && visitor._id.toString() !== req.user._id.toString()) {
        // Move markdowns from visitor to authenticated user
        const { MarkdownItem } = await import('../models/index.js');
        await MarkdownItem.updateMany(
          { user: visitor._id },
          { user: req.user._id }
        );
        req.user.markdowns.push(...visitor.markdowns);
        await req.user.save();
        await User.deleteOne({ _id: visitor._id });
      }
      delete req.session.visitorId;
    }
    res.redirect('/');
  }
);

// Google OAuth
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/?auth=failed' }),
  async (req, res) => {
    // Merge visitor markdowns
    if (req.session.visitorId && req.user) {
      const visitor = await User.findOne({ visitor_id: req.session.visitorId });
      if (visitor && visitor._id.toString() !== req.user._id.toString()) {
        const { MarkdownItem } = await import('../models/index.js');
        await MarkdownItem.updateMany(
          { user: visitor._id },
          { user: req.user._id }
        );
        req.user.markdowns.push(...visitor.markdowns);
        await req.user.save();
        await User.deleteOne({ _id: visitor._id });
      }
      delete req.session.visitorId;
    }
    res.redirect('/');
  }
);

// Logout
router.post('/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });
});

export default router;
