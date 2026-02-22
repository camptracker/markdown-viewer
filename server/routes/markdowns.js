import { Router } from 'express';
import { MarkdownItem, User } from '../models/index.js';

const router = Router();

// List user's markdowns
router.get('/', async (req, res) => {
  if (!req.user) return res.json({ markdowns: [] });
  const items = await MarkdownItem.find({ user: req.user._id })
    .sort({ updated_at: -1 })
    .select('-content'); // Don't send full content in list
  res.json({ markdowns: items });
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
    $push: { markdowns: item._id },
  });

  res.status(201).json({ markdown: item });
});

// Get single markdown (public)
router.get('/:id', async (req, res) => {
  try {
    const item = await MarkdownItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    // Check if current user is owner
    const isOwner = req.user && item.user.toString() === req.user._id.toString();
    res.json({ markdown: item, isOwner });
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
      $pull: { markdowns: item._id },
    });
    await MarkdownItem.deleteOne({ _id: item._id });

    res.json({ ok: true });
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ error: 'Not found' });
    throw err;
  }
});

export default router;
