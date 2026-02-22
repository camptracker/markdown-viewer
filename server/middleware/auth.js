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

  // Check for visitor_id from client header (persisted in localStorage)
  const clientVisitorId = req.headers['x-visitor-id'];
  if (clientVisitorId) {
    const user = await User.findOne({ visitor_id: clientVisitorId });
    if (user) {
      req.session.visitorId = clientVisitorId;
      req.user = user;
      return next();
    }
  }

  // Create new visitor (use client-provided ID if valid UUID format, otherwise generate)
  const visitorId = clientVisitorId && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientVisitorId)
    ? clientVisitorId
    : uuidv4();
  const user = await User.create({ visitor_id: visitorId });
  req.session.visitorId = visitorId;
  req.user = user;
  // Send the visitor_id back so client can store it
  res.setHeader('x-visitor-id', visitorId);
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}
