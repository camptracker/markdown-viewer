import { Router } from 'express';
import { MarkdownItem, User } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// List user's markdowns
router.get('/', requireAuth, async (req, res) => {
  const items = await MarkdownItem.find({ user: req.user._id })
    .sort({ updated_at: -1 })
    .select('-content'); // Don't send full content in list
  res.json({ markdowns: items });
});

// Create markdown
router.post('/', requireAuth, async (req, res) => {
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
    $push: { markdowns: item._id },
  });

  res.status(201).json({ markdown: item });
});

// Get single markdown
router.get('/:id', async (req, res) => {
  const item = await MarkdownItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  // Public access: anyone can read. Ownership check only for edits.
  res.json({ markdown: item });
});

// Update markdown
router.put('/:id', requireAuth, async (req, res) => {
  const item = await MarkdownItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  if (item.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!item.can_edit) {
    return res.status(403).json({ error: 'Document is read-only' });
  }

  const { content, title, can_edit } = req.body;
  if (content !== undefined) item.content = content;
  if (title !== undefined) item.title = title;
  if (can_edit !== undefined) item.can_edit = can_edit;
  await item.save();

  res.json({ markdown: item });
});

// Delete markdown
router.delete('/:id', requireAuth, async (req, res) => {
  const item = await MarkdownItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  if (item.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await User.findByIdAndUpdate(req.user._id, {
    $pull: { markdowns: item._id },
  });
  await MarkdownItem.deleteOne({ _id: item._id });

  res.json({ ok: true });
});

export default router;
