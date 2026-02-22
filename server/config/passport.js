import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User } from '../models/index.js';

export default function configurePassport() {
  passport.serializeUser((user, done) => done(null, user._id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  if (process.env.GITHUB_CLIENT_ID) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          callbackURL: `${process.env.CLIENT_URL}/api/auth/github/callback`,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            let user = await User.findOne({ github_id: profile.id });
            if (!user) {
              user = await User.create({
                github_id: profile.id,
                github_username: profile.username,
                github_avatar_url: profile.photos?.[0]?.value,
                github_access_token: accessToken,
              });
            } else {
              user.github_username = profile.username;
              user.github_avatar_url = profile.photos?.[0]?.value;
              user.github_access_token = accessToken;
              await user.save();
            }
            done(null, user);
          } catch (err) {
            done(err);
          }
        }
      )
    );
  }

  if (process.env.GOOGLE_CLIENT_ID) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${process.env.CLIENT_URL}/api/auth/google/callback`,
          scope: ['profile', 'email'],
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            let user = await User.findOne({ google_id: profile.id });
            if (!user) {
              user = await User.create({
                google_id: profile.id,
                google_email: profile.emails?.[0]?.value,
                google_name: profile.displayName,
                google_avatar_url: profile.photos?.[0]?.value,
                google_access_token: accessToken,
              });
            } else {
              user.google_email = profile.emails?.[0]?.value;
              user.google_name = profile.displayName;
              user.google_avatar_url = profile.photos?.[0]?.value;
              user.google_access_token = accessToken;
              await user.save();
            }
            done(null, user);
          } catch (err) {
            done(err);
          }
        }
      )
    );
  }
}
