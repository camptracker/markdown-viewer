import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    visitor_id: {
      type: String,
      sparse: true,
      unique: true,
    },
    github_id: {
      type: String,
      sparse: true,
      unique: true,
    },
    github_username: String,
    github_avatar_url: String,
    github_access_token: String,
    google_id: {
      type: String,
      sparse: true,
      unique: true,
    },
    google_email: String,
    google_name: String,
    google_avatar_url: String,
    google_access_token: String,
    markdowns: [
      {
        markdown: { type: mongoose.Schema.Types.ObjectId, ref: 'MarkdownItem' },
        added_at: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const User = mongoose.model('User', userSchema);

export default User;
