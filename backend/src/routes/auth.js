const express = require('express');
const axios = require('axios');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const config = require('../config/config');
const logger = require('../config/logger');
const { auth } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');
const { enrichUserAccess, normalizeGroups, getGroupMappings, strongestRole } = require('../services/permissions');
const { normalizeSsoGroupClaim } = require('../services/ssoGroups');
const { nextId } = require('../services/ids');

const router = express.Router();

const selectUser = { id: true, username: true, displayName: true, email: true, role: true, ssoGroups: true, preferences: true };

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
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    // Ohne Benutzername/Passwort nie suchen: ein undefined-Feld ließe prisma sonst
    // den beliebig ersten Benutzer zurückliefen (und der Login würde gegen dessen
    // Hash verglichen).
    if (!username || !password) {
      return res.status(401).json({ error: 'Benutzername oder Passwort falsch', code: 'BAD_CREDENTIALS' });
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ username }, { email: username }] }
    });

    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Benutzername oder Passwort falsch', code: 'BAD_CREDENTIALS' });
    }

    // Alle vorherigen Sessions des Benutzers löschen — nur ein Gerät darf gleichzeitig eingeloggt sein
    await prisma.session.deleteMany({ where: { userId: user.id } });

    // Serverseitige Session erstellen
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 Stunden
    const session = await prisma.session.create({
      data: { userId: user.id, expiresAt }
    });

    const token = jwt.sign({ role: user.role, sid: session.id }, config.jwtSecret, {
      subject: user.id,
      expiresIn: config.jwtExpiresIn
    });

    const accessUser = await enrichUserAccess({ id: user.id, username: user.username, displayName: user.displayName, email: user.email, role: user.role, ssoGroups: user.ssoGroups, preferences: user.preferences, permissions: user.permissions, revokedPermissions: user.revokedPermissions });

    return res.json({
      token,
      user: publicUser(accessUser)
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', auth, async (req, res, next) => {
  try {
    // Serverseitige Session löschen — das Token aller Geräte wird dadurch ungültig
    if (req.tokenPayload?.sid) {
      await prisma.session.delete({ where: { id: req.tokenPayload.sid } }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

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

    // Alle bisherigen Sessions löschen — alle Geräte werden abgemeldet
    await prisma.session.deleteMany({ where: { userId: req.user.id } });

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

async function fetchWithRetry(url, options, maxRetries = 2) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await axios.get(url, options);
    } catch (err) {
      if (i === maxRetries) throw err;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
    }
  }
}

// Verifiziert ein OIDC-ID-Token gegen die JWKS des Issuers (nur RS256),
// damit fremde/gefälschte Claims nie als Benutzeridentität akzeptiert werden.
async function verifyIdToken(idToken, issuerUrl, jwksUri) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('Ungültiges ID-Token-Format');

  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  if (header.alg !== 'RS256') throw new Error('Nur RS256-signierte ID-Tokens werden unterstützt');

  if (!jwksUri) throw new Error('Keine JWKS-URI im OpenID-Configuration-Dokument');

  const { data: jwks } = await axios.get(jwksUri, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    timeout: 10000
  });
  const key = (jwks.keys || []).find((k) => k.kty === 'RSA' && k.kid === header.kid);
  if (!key) throw new Error('Kein passender JWKS-Schlüssel gefunden');

  const publicKey = crypto.createPublicKey({ key: { kty: key.kty, n: key.n, e: key.e }, format: 'jwk' });

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8'));
  verifier.end();
  if (!verifier.verify(publicKey, Buffer.from(parts[2], 'base64url'))) {
    throw new Error('ID-Token-Signatur ungültig');
  }

  const claims = jwt.verify(idToken, publicKey, { algorithms: ['RS256'] });
  const normalizedIssuer = issuerUrl.replace(/\/$/, '');
  if (claims.iss !== issuerUrl && claims.iss !== normalizedIssuer) {
    throw new Error('ID-Token-Issuer stimmt nicht überein');
  }
  return claims;
}

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
    const { data: openidConfig } = await fetchWithRetry(configUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      timeout: 10000
    });
    const authEndpoint = openidConfig.authorization_endpoint;

    if (!authEndpoint) {
      return res.status(502).send('SSO authorization_endpoint nicht gefunden.');
    }

    const redirectAfterLogin = req.query.redirect || '';
    const stateToken = jwt.sign({ nonce: crypto.randomBytes(16).toString('hex'), redirect: redirectAfterLogin }, config.jwtSecret, { expiresIn: '15m' });
    const redirectUri = settings['sso.redirectUri'] || `${requestProtocol(req)}://${req.get('host')}${config.basePath || '/inventory'}/api/auth/sso/callback`;

    const authUrl = new URL(authEndpoint);
    authUrl.searchParams.append('client_id', settings['sso.clientId'] || '');
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'openid email profile groups');
    authUrl.searchParams.append('state', stateToken);

    return res.redirect(authUrl.toString());
  } catch (error) {
    logger.error({ err: error, url: req.url }, 'SSO redirect error');
    return res.status(502).send('SSO-Verbindungsfehler. Bitte versuchen Sie es erneut.');
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
    if (!issuerUrl) {
      return res.status(400).send('SSO Issuer-URL fehlt in den Einstellungen.');
    }
    const configUrl = `${issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const { data: openidConfig } = await fetchWithRetry(configUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      timeout: 10000
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
    
    let userinfo = null;
    if (userinfoEndpoint && accessToken) {
      try {
        const { data } = await axios.get(userinfoEndpoint, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 8000
        });
        userinfo = data || null;
      } catch (userinfoError) {
        logger.warn({ err: userinfoError.message }, 'Fehler beim Abrufen der SSO-Userinfo');
      }
    }

    // ID-Token nur nach Signatur-Verifikation gegen die Issuer-JWKS verwenden
    let idTokenClaims = null;
    if (tokenResponse.id_token) {
      try {
        idTokenClaims = await verifyIdToken(tokenResponse.id_token, issuerUrl, openidConfig.jwks_uri);
      } catch (verifyError) {
        logger.warn({ err: verifyError.message }, 'ID-Token-Validierung fehlgeschlagen');
      }
    }

    if (!userinfo && !idTokenClaims) {
      return res.status(502).send('SSO-Benutzerdaten konnten nicht verifiziert werden. Bitte versuchen Sie es erneut.');
    }

    const ssoId = userinfo?.sub || idTokenClaims?.sub;
    const email = userinfo?.email || idTokenClaims?.email;
    const username = userinfo?.preferred_username || userinfo?.username || idTokenClaims?.preferred_username || idTokenClaims?.username || email?.split('@')[0] || ssoId;
    const displayName = userinfo?.name || idTokenClaims?.name || userinfo?.displayname || userinfo?.displayName || userinfo?.preferred_username || username || null;
        
    if (!ssoId) {
      return res.status(400).send('SSO-Provider hat keine Benutzer-ID (sub) zurückgegeben.');
    }
    if (!email && !username) {
      return res.status(400).send('Keine Benutzerdaten (Email/Username) vom SSO-Provider erhalten.');
    }

    // Lese den konfigurierten Gruppen-Claim-Namen aus den SSO-Einstellungen
    const groupClaim = settings['sso.groupClaim'] || 'groups';
    // Gruppen aus userinfo oder ID-TokenClaims mit dem konfigurierten Claim-Namen lesen
    // Unterstützt sowohl Array-Format als auch einzelnen String-Wert
    let rawGroups = userinfo?.[groupClaim] || idTokenClaims?.[groupClaim]
      || userinfo?.groups || idTokenClaims?.groups
      || userinfo?.roles || idTokenClaims?.roles
      || [];

    // Normalisierung: unterstützt String, String-Array, Objekt-Array sowie die
    // IServ-Objekt-Struktur ({"0": {name: "lehrer"}, ...}) und Wrapper-Objekte.
    const normalizedSsoGroups = normalizeSsoGroupClaim(rawGroups);
    const ssoGroups = JSON.stringify(normalizedSsoGroups);

    logger.info({ userId: ssoId, groupClaim, ssoGroups: normalizedSsoGroups }, 'SSO groups extracted from claim');

    // Berechne die effektive Rolle aus den SSO-Gruppen
    const mappings = await getGroupMappings();
    let effectiveRole = 'VIEWER';
    for (const mapping of mappings) {
      if (!mapping?.group || !normalizedSsoGroups.includes(mapping.group)) continue;
      if (mapping.role) {
        effectiveRole = strongestRole(effectiveRole, mapping.role);
      }
    }

    // Nur anhand der SSO-ID verknüpfen – bestehende lokale Konten werden bewusst
    // NICHT per E-Mail/Username übernommen (Schutz vor Account-Takeover).
    let user = await prisma.user.findUnique({ where: { ssoId } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: await nextId('user'),
          ssoId,
          username: username || email.split('@')[0],
          email: email || `${username}@sso.local`,
          displayName,
          role: effectiveRole,
          ssoGroups
        }
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          username: username || user.username,
          email: email || user.email,
          displayName: displayName || user.displayName,
          ssoGroups,
          role: effectiveRole
        }
      });
    }

    const enrichedUser = await enrichUserAccess({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      ssoGroups: user.ssoGroups,
      preferences: user.preferences,
      permissions: user.permissions,
      revokedPermissions: user.revokedPermissions
    });

    // Alle vorherigen Sessions des Benutzers löschen — nur ein Gerät darf gleichzeitig eingeloggt sein
    await prisma.session.deleteMany({ where: { userId: user.id } });

    // Serverseitige Session erstellen
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: { userId: user.id, expiresAt }
    });

    const sessionToken = jwt.sign({ role: enrichedUser.effectiveRole || user.role, sid: session.id }, config.jwtSecret, {
      subject: user.id,
      expiresIn: config.jwtExpiresIn
    });

    const appUrl = (settings['app.url'] || `${requestProtocol(req)}://${req.get('host')}${config.basePath || '/inventory'}`).replace(/\/+$/, '');
    const redirectTarget = statePayload.redirect || '/dashboard';
    const safeRedirect = redirectTarget.startsWith('/') ? redirectTarget : '/dashboard';
    const separator = safeRedirect.includes('?') ? '&' : '?';
    const redirectUrl = `${appUrl}${safeRedirect}${separator}sso-token=${encodeURIComponent(sessionToken)}`;
    logger.info({ redirectTarget: safeRedirect, userId: user.id }, 'SSO callback redirect');
    return res.redirect(302, redirectUrl);
  } catch (error) {
    logger.error({ err: error, code: error.response?.status, body: error.response?.data }, 'SSO callback error');
    return res.status(502).send('SSO-Callback-Fehler. Bitte versuchen Sie es erneut.');
  }
});

module.exports = router;
