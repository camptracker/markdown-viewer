import mongoose from 'mongoose';

const markdownItemSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    can_edit: {
      type: Boolean,
      default: true,
    },
    title: {
      type: String,
      default: 'Untitled',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const MarkdownItem = mongoose.model('MarkdownItem', markdownItemSchema);

export default MarkdownItem;
