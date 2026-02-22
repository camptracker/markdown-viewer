import { Router } from 'express';
import { MarkdownItem, User } from '../models/index.js';

const router = Router();

// List user's markdowns
router.get('/', async (req, res) => {
  if (!req.user) return res.json({ markdowns: [] });
  const user = await User.findById(req.user._id);
  if (!user?.markdowns?.length) return res.json({ markdowns: [] });

  // Build map of markdown_id -> added_at
  const addedMap = {};
  for (const entry of user.markdowns) {
    const id = entry.markdown?.toString() || entry.toString();
    addedMap[id] = entry.added_at || entry._id?.getTimestamp?.() || new Date();
  }

  const ids = user.markdowns.map(e => e.markdown || e);
  const items = await MarkdownItem.find({ _id: { $in: ids } });

  // Add added_at to each item and sort by most recently added
  const result = items.map(item => {
    const obj = item.toObject();
    obj.added_at = addedMap[item._id.toString()] || obj.created_at;
    return obj;
  });
  result.sort((a, b) => new Date(b.added_at) - new Date(a.added_at));

  res.json({ markdowns: result });
});

// Create markdown
router.post('/', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { content, title, can_edit } = req.body;
  if (!content) return res.status(400).json({ error: 'content is required' });

  const item = await MarkdownItem.create({
    content,
    title: title || 'Untitled',
    can_edit: can_edit !== undefined ? can_edit : true,
    user: req.user._id,
  });

  // Add to user's markdowns array
  await User.findByIdAndUpdate(req.user._id, {
    $push: { markdowns: { markdown: item._id, added_at: new Date() } },
  });

  res.status(201).json({ markdown: item });
});

// Get single markdown (public)
router.get('/:id', async (req, res) => {
  try {
    const item = await MarkdownItem.findById(req.params.id)
      .populate('user', 'github_username google_name google_email visitor_id');
    if (!item) return res.status(404).json({ error: 'Not found' });
    // Check if current user is owner
    const isOwner = req.user && item.user._id.toString() === req.user._id.toString();
    // Derive author display name
    const u = item.user;
    const author = u?.github_username || u?.google_name || u?.google_email || (u?.visitor_id ? u.visitor_id.slice(0, 8) : null);
    // Strip populated user from response
    const mdObj = item.toObject();
    mdObj.user = item.user._id;
    res.json({ markdown: mdObj, isOwner, author });
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ error: 'Not found' });
    throw err;
  }
});

// Bulk create markdowns
router.post('/bulk', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { items } = req.body; // [{title, content, can_edit}]
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });

  const results = [];
  for (const item of items) {
    const md = await MarkdownItem.create({
      content: item.content || '',
      title: item.title || 'Untitled',
      can_edit: item.can_edit !== undefined ? item.can_edit : true,
      user: req.user._id,
    });
    await User.findByIdAndUpdate(req.user._id, {
      $push: { markdowns: { markdown: md._id, added_at: new Date() } },
    });
    results.push({ _id: md._id, title: md.title });
  }
  res.status(201).json({ created: results.length, markdowns: results });
});

// Add existing markdown to user's list (for shared links)
router.post('/:id/add', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const item = await MarkdownItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });

    // Only add if not already in user's list
    const alreadyHas = req.user.markdowns.some(e => 
      (e.markdown || e).toString() === item._id.toString()
    );
    if (!alreadyHas) {
      req.user.markdowns.push({ markdown: item._id, added_at: new Date() });
      await req.user.save();
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ error: 'Not found' });
    throw err;
  }
});

// Patch markdown (partial update)
router.patch('/:id', async (req, res) => {
  try {
    const item = await MarkdownItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!item.can_edit) {
      return res.status(403).json({ error: 'Document is read-only' });
    }

    const { content, title } = req.body;
    if (content !== undefined) item.content = content;
    if (title !== undefined) item.title = title;
    await item.save();

    res.json({ markdown: item });
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ error: 'Not found' });
    throw err;
  }
});

// Update markdown (full update)
router.put('/:id', async (req, res) => {
  try {
    const item = await MarkdownItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!item.can_edit) {
      return res.status(403).json({ error: 'Document is read-only' });
    }

    const { content, title, can_edit } = req.body;
    if (content !== undefined) item.content = content;
    if (title !== undefined) item.title = title;
    if (can_edit !== undefined) item.can_edit = can_edit;
    await item.save();

    res.json({ markdown: item });
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ error: 'Not found' });
    throw err;
  }
});

// Delete markdown (owner only)
router.delete('/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const item = await MarkdownItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (item.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await User.findByIdAndUpdate(req.user._id, {
      $pull: { markdowns: { markdown: item._id } },
    });
    await MarkdownItem.deleteOne({ _id: item._id });

    res.json({ ok: true });
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ error: 'Not found' });
    throw err;
  }
});

export default router;
