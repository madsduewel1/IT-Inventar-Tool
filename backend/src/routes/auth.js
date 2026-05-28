const express = require('express');
const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const config = require('../config/config');
const logger = require('../config/logger');
const { auth } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');
const { enrichUserAccess, normalizeGroups } = require('../services/permissions');

const router = express.Router();

const selectUser = { id: true, username: true, email: true, role: true, ssoGroups: true, preferences: true };

function parsePreferences(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function requestProtocol(req) {
  const proto = req.headers['x-forwarded-proto'];
  if (proto) return proto.split(',')[0].trim();
  return req.protocol;
}

function publicUser(user) {
  if (!user) return user;
  return { ...user, ssoGroups: normalizeGroups(user.ssoGroups), preferences: parsePreferences(user.preferences) };
}

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const user = await prisma.user.findFirst({
      where: { OR: [{ username }, { email: username }] }
    });

    if (!user?.passwordHash || !(await bcrypt.compare(password || '', user.passwordHash))) {
      return res.status(401).json({ error: 'Benutzername oder Passwort falsch', code: 'BAD_CREDENTIALS' });
    }

    const token = jwt.sign({ role: user.role }, config.jwtSecret, {
      subject: user.id,
      expiresIn: config.jwtExpiresIn
    });

    const accessUser = await enrichUserAccess({ id: user.id, username: user.username, email: user.email, role: user.role, ssoGroups: user.ssoGroups, preferences: user.preferences });

    return res.json({
      token,
      user: publicUser(accessUser)
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', auth, (req, res) => res.json({ ok: true }));

router.get('/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

router.patch('/preferences', auth, async (req, res, next) => {
  try {
    const current = parsePreferences(req.user.preferences);
    const allowed = {};
    if (['light', 'dark'].includes(req.body.theme)) allowed.theme = req.body.theme;
    if (['de', 'en'].includes(req.body.locale)) allowed.locale = req.body.locale;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { preferences: JSON.stringify({ ...current, ...allowed }) },
      select: selectUser
    });

    return res.json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.post('/change-password', auth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Passwortdaten sind ungültig', code: 'INVALID_PASSWORD_INPUT' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(403).json({ error: 'Aktuelles Passwort ist falsch', code: 'BAD_CURRENT_PASSWORD' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash } });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/sso/redirect', async (req, res, next) => {
  try {
    const settingsList = await prisma.setting.findMany();
    const settings = Object.fromEntries(settingsList.map((row) => [row.key, row.value]));

    if (settings['sso.enabled'] !== 'true') {
      return res.status(400).send('SSO ist nicht aktiviert.');
    }

    const issuerUrl = settings['sso.issuerUrl'];
    if (!issuerUrl) {
      return res.status(400).send('SSO Issuer-URL fehlt in den Einstellungen.');
    }

    // discovery URL abrufen
    const configUrl = `${issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const { data: openidConfig } = await axios.get(configUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      timeout: 8000
    });
    const authEndpoint = openidConfig.authorization_endpoint;

    if (!authEndpoint) {
      return res.status(502).send('SSO authorization_endpoint nicht gefunden.');
    }

    const redirectAfterLogin = req.query.redirect || '';
    const stateToken = jwt.sign({ nonce: Math.random().toString(36).substring(7), redirect: redirectAfterLogin }, config.jwtSecret, { expiresIn: '15m' });
    const redirectUri = settings['sso.redirectUri'] || `${requestProtocol(req)}://${req.get('host')}${config.basePath || '/inventory'}/api/auth/sso/callback`;

    const authUrl = new URL(authEndpoint);
    authUrl.searchParams.append('client_id', settings['sso.clientId'] || '');
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'openid email profile');
    authUrl.searchParams.append('state', stateToken);

    return res.redirect(authUrl.toString());
  } catch (error) {
    logger.error({ err: error, url: req.url }, 'SSO redirect error');
    return res.status(502).send(`SSO-Verbindungsfehler: ${error.message}`);
  }
});

router.get('/sso/callback', async (req, res, next) => {
  try {
    const { state, code } = req.query;
    if (!code) {
      return res.status(400).send('SSO-Code fehlt im Callback.');
    }

    let statePayload = {};
    try {
      statePayload = jwt.verify(state, config.jwtSecret);
    } catch {
      return res.status(400).send('Ungültiger oder abgelaufener SSO-State. Bitte versuche es erneut.');
    }

    const settingsList = await prisma.setting.findMany();
    const settings = Object.fromEntries(settingsList.map((row) => [row.key, row.value]));

    const issuerUrl = settings['sso.issuerUrl'];
    const configUrl = `${issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const { data: openidConfig } = await axios.get(configUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      timeout: 8000
    });
    
    const tokenEndpoint = openidConfig.token_endpoint;
    const userinfoEndpoint = openidConfig.userinfo_endpoint;

    if (!tokenEndpoint) {
      return res.status(502).send('SSO token_endpoint nicht gefunden.');
    }

    const redirectUri = settings['sso.redirectUri'] || `${requestProtocol(req)}://${req.get('host')}${config.basePath || '/inventory'}/api/auth/sso/callback`;
    
    const clientId = settings['sso.clientId'] || '';
    const clientSecret = settings['sso.clientSecret'] || '';
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);

    const { data: tokenResponse } = await axios.post(tokenEndpoint, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });

    const accessToken = tokenResponse.access_token;
    
    let userinfo = {};
    if (userinfoEndpoint && accessToken) {
      try {
        const { data } = await axios.get(userinfoEndpoint, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 8000
        });
        userinfo = data || {};
      } catch (userinfoError) {
        console.error('Fehler beim Abrufen der SSO-Userinfo, verwende ID-Token-Fallback:', userinfoError.message);
      }
    }

    let idTokenClaims = {};
    if (tokenResponse.id_token) {
      try {
        idTokenClaims = jwt.decode(tokenResponse.id_token) || {};
      } catch (decodeError) {
        console.error('Fehler beim Dekodieren des SSO-ID-Tokens:', decodeError.message);
      }
    }

    const ssoId = userinfo.sub || idTokenClaims.sub;
    const email = userinfo.email || idTokenClaims.email;
    const username = userinfo.preferred_username || userinfo.username || idTokenClaims.preferred_username || idTokenClaims.name || email?.split('@')[0] || ssoId;

    if (!email && !username) {
      return res.status(400).send('Keine Benutzerdaten (Email/Username) vom SSO-Provider erhalten.');
    }

    // Lese Gruppen aus standardmäßigen Claims (groups oder roles)
    const rawGroups = userinfo.groups || idTokenClaims.groups || userinfo.roles || idTokenClaims.roles || [];
    const ssoGroups = Array.isArray(rawGroups) ? JSON.stringify(rawGroups.map(String)) : '[]';

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          ssoId ? { ssoId } : null,
          email ? { email } : null,
          username ? { username } : null
        ].filter(Boolean)
      }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          ssoId,
          username: username || email.split('@')[0],
          email: email || `${username}@sso.local`,
          role: 'VIEWER',
          ssoGroups
        }
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          ssoId: user.ssoId || ssoId,
          ssoGroups
        }
      });
    }

    const enrichedUser = await enrichUserAccess({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      ssoGroups: user.ssoGroups,
      preferences: user.preferences
    });

    const sessionToken = jwt.sign({ role: enrichedUser.effectiveRole || user.role }, config.jwtSecret, {
      subject: user.id,
      expiresIn: config.jwtExpiresIn
    });

    const appUrl = (settings['app.url'] || `${requestProtocol(req)}://${req.get('host')}${config.basePath || '/inventory'}`).replace(/\/+$/, '');
    const redirectTarget = statePayload.redirect || '/dashboard';
    const safeRedirect = redirectTarget.startsWith('/') ? redirectTarget : '/dashboard';
    const redirectUrl = `${appUrl}${safeRedirect}?sso-token=${encodeURIComponent(sessionToken)}`;
    logger.info({ redirectUrl }, 'SSO callback redirect');
    return res.redirect(302, redirectUrl);
  } catch (error) {
    logger.error({ err: error, code: error.response?.status, body: error.response?.data }, 'SSO callback error');
    return res.status(502).send(`SSO-Callback-Fehler: ${error.response?.data?.error_description || error.message}`);
  }
});

module.exports = router;
