import { v4 as uuidv4 } from 'uuid';
import { User } from '../models/index.js';

// Ensure every request has a user (visitor or authenticated)
export async function ensureUser(req, res, next) {
  if (req.user) return next();

  // Check for visitor_id in session
  if (req.session.visitorId) {
    const user = await User.findOne({ visitor_id: req.session.visitorId });
    if (user) {
      req.user = user;
      return next();
    }
  }

  // Create new visitor
  const visitorId = uuidv4();
  const user = await User.create({ visitor_id: visitorId });
  req.session.visitorId = visitorId;
  req.user = user;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}
