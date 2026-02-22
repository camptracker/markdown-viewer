import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User, MarkdownItem } from '../models/index.js';

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

  // Helper: transfer markdowns from visitor to OAuth user, keep visitor alive (empty)
  async function transferMarkdowns(visitorId, oauthUser) {
    if (!visitorId) return;
    const visitor = await User.findOne({ visitor_id: visitorId });
    if (!visitor || visitor._id.equals(oauthUser._id)) return;

    // Transfer markdown ownership
    if (visitor.markdowns?.length) {
      await MarkdownItem.updateMany(
        { user: visitor._id },
        { $set: { user: oauthUser._id } }
      );
      // Add markdown refs to OAuth user, clear from visitor
      oauthUser.markdowns.push(...visitor.markdowns);
      await oauthUser.save();
      visitor.markdowns = [];
      await visitor.save();
    }
    // Keep visitor user alive so logout restores to it
  }

  if (process.env.GITHUB_CLIENT_ID) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          callbackURL: `${process.env.CLIENT_URL}/api/auth/github/callback`,
          passReqToCallback: true,
        },
        async (req, accessToken, refreshToken, profile, done) => {
          try {
            let user = await User.findOne({ github_id: profile.id });
            const visitorId = req.session?.visitorId;

            if (user) {
              // Returning GitHub user — update profile, no markdown transfer
              user.github_username = profile.username;
              user.github_avatar_url = profile.photos?.[0]?.value;
              user.github_access_token = accessToken;
              await user.save();
            } else {
              // First-time GitHub login — create new OAuth user (no visitor_id!)
              user = await User.create({
                github_id: profile.id,
                github_username: profile.username,
                github_avatar_url: profile.photos?.[0]?.value,
                github_access_token: accessToken,
              });
              // Transfer markdowns from visitor to this new OAuth user
              await transferMarkdowns(visitorId, user);
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
          passReqToCallback: true,
        },
        async (req, accessToken, refreshToken, profile, done) => {
          try {
            let user = await User.findOne({ google_id: profile.id });
            const visitorId = req.session?.visitorId;

            if (user) {
              // Returning Google user — update profile, no markdown transfer
              user.google_email = profile.emails?.[0]?.value;
              user.google_name = profile.displayName;
              user.google_avatar_url = profile.photos?.[0]?.value;
              user.google_access_token = accessToken;
              await user.save();
            } else {
              // First-time Google login — create new OAuth user (no visitor_id!)
              user = await User.create({
                google_id: profile.id,
                google_email: profile.emails?.[0]?.value,
                google_name: profile.displayName,
                google_avatar_url: profile.photos?.[0]?.value,
                google_access_token: accessToken,
              });
              // Transfer markdowns from visitor to this new OAuth user
              await transferMarkdowns(visitorId, user);
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
